/**
 * Import product images from a Shopify exported CSV.
 *
 * Usage:
 *   npm run db:import:shopify-csv -- products_export.csv
 *
 * The CSV must be the standard Shopify product export:
 *   Products > Export > CSV for Excel/Numbers/other spreadsheet programs
 *
 * Columns used:
 *   Handle, Title, Image Src, Image Alt Text
 */

import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const csvFilePath = process.argv[2];
if (!csvFilePath) {
  console.error('Usage: npm run db:import:shopify-csv -- <path-to-products-export.csv>');
  process.exit(1);
}

const resolvedCsvPath = path.isAbsolute(csvFilePath)
  ? csvFilePath
  : path.join(process.cwd(), csvFilePath);

if (!existsSync(resolvedCsvPath)) {
  console.error(`File not found: ${resolvedCsvPath}`);
  process.exit(1);
}

const publicMediaRoot = path.join(process.cwd(), 'public', 'media', 'storefront', 'shopify');
const manifestFilePath = path.join(
  process.cwd(),
  'src',
  'lib',
  'generated',
  'storefront-image-manifest.json',
);

// --------------------------------------------------------------------------
// CSV parser (handles quoted fields with embedded commas/newlines)
// --------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

async function parseCsv(
  filePath: string,
): Promise<Array<Record<string, string>>> {
  const rows: Array<Record<string, string>> = [];
  const rl = createInterface({
    input: createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let isFirst = true;

  for await (const rawLine of rl) {
    const fields = parseCsvLine(rawLine);
    if (isFirst) {
      headers = fields.map((h) => h.trim());
      isFirst = false;
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

// --------------------------------------------------------------------------
// Download helper
// --------------------------------------------------------------------------
async function downloadImage(
  url: string,
  destPath: string,
): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`  ⚠  HTTP ${res.status} — ${url}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(destPath, buffer);
    return true;
  } catch (err) {
    console.warn(`  ⚠  fetch error for ${url}: ${(err as Error).message}`);
    return false;
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  console.log(`\nParsing CSV: ${resolvedCsvPath}\n`);
  const rows = await parseCsv(resolvedCsvPath);

  // Group by handle — collect unique image URLs per product.
  // Shopify CSV repeats the Handle row for each variant/image.
  const productImages: Map<string, { title: string; urls: string[] }> =
    new Map();

  for (const row of rows) {
    const handle = row['Handle'];
    const imageSrc = row['Image Src'];
    if (!handle || !imageSrc) continue;

    if (!productImages.has(handle)) {
      productImages.set(handle, {
        title: row['Title'] || handle,
        urls: [],
      });
    }

    const entry = productImages.get(handle)!;
    // Deduplicate
    if (!entry.urls.includes(imageSrc)) {
      entry.urls.push(imageSrc);
    }
  }

  console.log(`Found ${productImages.size} unique products with images.\n`);

  await mkdir(publicMediaRoot, { recursive: true });

  // Load existing manifest so we don't overwrite manual entries.
  let manifest: Record<string, string | string[]> = {};
  try {
    const raw = await readFile(manifestFilePath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    // starts empty
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [handle, { title, urls }] of productImages) {
    const localPaths: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      // Derive a stable filename from the URL
      const urlPath = new URL(url).pathname; // e.g. /files/1/0001/product.jpg
      const ext =
        path.extname(urlPath).split('?')[0] || '.jpg';
      const fileName = `${handle}${urls.length > 1 ? `-${i + 1}` : ''}${ext}`;
      const destPath = path.join(publicMediaRoot, fileName);
      const publicUrl = `/media/storefront/shopify/${fileName}`;

      if (existsSync(destPath)) {
        console.log(`  ↩  already exists: ${fileName}`);
        localPaths.push(publicUrl);
        skipped++;
        continue;
      }

      process.stdout.write(`  ↓  ${title} [${i + 1}/${urls.length}] ${fileName} ... `);
      const ok = await downloadImage(url, destPath);
      if (ok) {
        process.stdout.write('✓\n');
        localPaths.push(publicUrl);
        downloaded++;
      } else {
        process.stdout.write('✗\n');
        failed++;
      }
    }

    if (localPaths.length === 1) {
      manifest[handle] = localPaths[0];
    } else if (localPaths.length > 1) {
      manifest[handle] = localPaths;
    }
  }

  await writeFile(manifestFilePath, JSON.stringify(manifest, null, 2));

  console.log(`
Done!
  ✓  Downloaded : ${downloaded}
  ↩  Skipped   : ${skipped} (already on disk)
  ✗  Failed    : ${failed}
  📄  Manifest  : ${manifestFilePath}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
