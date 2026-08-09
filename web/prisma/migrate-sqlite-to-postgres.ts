import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Client } from 'pg';

type TargetColumn = {
  columnName: string;
  dataType: string;
  udtName: string;
};

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function resolveSqlitePath(sqliteUrl?: string) {
  const fallbackPath = path.resolve(process.cwd(), 'prisma', 'dev.db');

  if (!sqliteUrl) {
    return fallbackPath;
  }

  if (!sqliteUrl.startsWith('file:')) {
    return path.resolve(process.cwd(), sqliteUrl);
  }

  const rawPath = sqliteUrl.slice('file:'.length);
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  const prismaRelativePath = path.resolve(process.cwd(), 'prisma', rawPath);
  if (fs.existsSync(prismaRelativePath)) {
    return prismaRelativePath;
  }

  return path.resolve(process.cwd(), rawPath);
}

function normaliseValue(value: unknown, targetColumn: TargetColumn) {
  if (value === null || value === undefined) {
    return null;
  }

  if (targetColumn.dataType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
  }

  const isTemporalColumn =
    targetColumn.dataType.includes('timestamp') ||
    targetColumn.dataType.includes('date') ||
    targetColumn.udtName.includes('timestamp') ||
    targetColumn.udtName === 'date';

  if (isTemporalColumn) {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }

    if (typeof value === 'string' && /^\d{10,13}$/.test(value)) {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        const milliseconds = value.length === 10 ? numericValue * 1000 : numericValue;
        return new Date(milliseconds).toISOString();
      }
    }
  }

  return value;
}

function sortTablesByDependencies(
  tables: string[],
  dependencies: Map<string, Set<string>>,
) {
  const reverseEdges = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const table of tables) {
    inDegree.set(table, dependencies.get(table)?.size ?? 0);
  }

  for (const [table, deps] of dependencies.entries()) {
    for (const dependency of deps) {
      const dependants = reverseEdges.get(dependency) ?? new Set<string>();
      dependants.add(table);
      reverseEdges.set(dependency, dependants);
    }
  }

  const queue = tables.filter((table) => (inDegree.get(table) ?? 0) === 0).sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);

    for (const dependant of reverseEdges.get(current) ?? []) {
      const nextInDegree = (inDegree.get(dependant) ?? 0) - 1;
      inDegree.set(dependant, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(dependant);
        queue.sort();
      }
    }
  }

  if (ordered.length !== tables.length) {
    const remaining = tables.filter((table) => !ordered.includes(table)).sort();
    ordered.push(...remaining);
  }

  return ordered;
}

async function main() {
  const targetDatabaseUrl = process.env.DATABASE_URL;
  if (!targetDatabaseUrl || !/^postgres(ql)?:\/\//i.test(targetDatabaseUrl)) {
    throw new Error('DATABASE_URL must point to a PostgreSQL database before running the SQLite migration.');
  }

  const sqlitePath = resolveSqlitePath(process.env.SQLITE_DATABASE_URL);
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database not found at ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pg = new Client({ connectionString: targetDatabaseUrl });

  try {
    await pg.connect();

    const tableRows = sqlite
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name != '_prisma_migrations'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    const sourceTables = tableRows.map((row) => row.name);
    if (sourceTables.length === 0) {
      throw new Error('No application tables were found in the SQLite source database.');
    }

    const targetColumnsResult = await pg.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
    }>(
      `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY ordinal_position`,
    );

    const targetColumnsByTable = new Map<string, Map<string, TargetColumn>>();
    for (const row of targetColumnsResult.rows) {
      const existing = targetColumnsByTable.get(row.table_name) ?? new Map<string, TargetColumn>();
      existing.set(row.column_name, {
        columnName: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name,
      });
      targetColumnsByTable.set(row.table_name, existing);
    }

    const tablesToImport = sourceTables.filter((table) => targetColumnsByTable.has(table));
    if (tablesToImport.length === 0) {
      throw new Error('No matching PostgreSQL tables were found. Run `npm run db:setup` first.');
    }

    const dependencies = new Map<string, Set<string>>();
    for (const table of tablesToImport) {
      const foreignKeys = sqlite
        .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
        .all() as Array<{ table: string }>;
      dependencies.set(
        table,
        new Set(
          foreignKeys
            .map((foreignKey) => foreignKey.table)
            .filter((dependency) => dependency !== table && tablesToImport.includes(dependency)),
        ),
      );
    }

    const orderedTables = sortTablesByDependencies(tablesToImport, dependencies);

    await pg.query(`TRUNCATE TABLE ${orderedTables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of orderedTables) {
      const sqliteColumns = sqlite
        .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
        .all() as Array<{ name: string }>;
      const targetColumns = targetColumnsByTable.get(table)!;
      const sharedColumns = sqliteColumns
        .map((column) => column.name)
        .filter((columnName) => targetColumns.has(columnName));

      if (sharedColumns.length === 0) {
        console.log(`Skipping ${table}: no shared columns found.`);
        continue;
      }

      const selectStatement = sqlite.prepare(
        `SELECT ${sharedColumns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table)}`,
      );
      const rows = selectStatement.all() as Array<Record<string, unknown>>;

      if (rows.length === 0) {
        console.log(`Copied 0 rows from ${table}`);
        continue;
      }

      const batchSize = 250;
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const values: unknown[] = [];

        const valueGroups = batch.map((row) => {
          const placeholders = sharedColumns.map((columnName) => {
            const targetColumn = targetColumns.get(columnName)!;
            values.push(normaliseValue(row[columnName], targetColumn));
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });

        const insertQuery = `INSERT INTO ${quoteIdentifier(table)} (${sharedColumns
          .map(quoteIdentifier)
          .join(', ')}) VALUES ${valueGroups.join(', ')}`;

        await pg.query(insertQuery, values);
      }

      console.log(`Copied ${rows.length} rows from ${table}`);
    }

    console.log(`SQLite migration complete from ${sqlitePath}`);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});