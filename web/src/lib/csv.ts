/**
 * Tiny CSV writer used by the admin /export endpoints.
 *
 * RFC 4180-ish: wraps values in double quotes when they contain a comma,
 * quote, or newline; escapes inner quotes by doubling them. We also strip
 * leading characters that Excel would interpret as a formula (=, +, -, @)
 * — this is the standard mitigation for CSV injection (OWASP).
 */

export type CsvRow = Record<string, unknown>;

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === 'object') {
    try { s = JSON.stringify(value); } catch { s = String(value); }
  } else {
    s = String(value);
  }

  // Prevent CSV / formula injection in Excel & Google Sheets.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }

  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from a list of plain row objects and an ordered list
 * of column definitions. We pass column defs explicitly so the column
 * order and headers stay stable across releases (vs. iterating Object.keys).
 */
export function toCsv<T extends CsvRow>(
  rows: T[],
  columns: Array<{ key: keyof T & string; header: string }>,
): string {
  const headerLine = columns.map((c) => safeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => safeCell(row[c.key])).join(','),
  );
  // BOM so Excel opens UTF-8 files (e.g. é, ¥, emojis) without mojibake.
  return '\uFEFF' + [headerLine, ...lines].join('\r\n') + '\r\n';
}

/**
 * Build a Content-Disposition value that downloads the file with a
 * versioned filename: `<prefix>-YYYY-MM-DD.csv`.
 */
export function csvFilename(prefix: string): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${prefix}-${y}-${m}-${day}.csv`;
}
