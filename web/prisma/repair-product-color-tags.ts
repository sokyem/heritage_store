/**
 * One-shot data repair for AdminProduct color metadata.
 *
 * Fixes two issues introduced when admins pasted JSON-ish text into the
 * per-image "color" tag field in /admin/products:
 *   1) imageEntries[].color values like `"Spider White"`, `["White"`, `Yellow]`
 *      with stray brackets / quote characters get normalized via cleanColorName.
 *   2) Products whose `colors` JSON array is empty but whose images carry color
 *      tags get a derived `colors` array so storefront pages that only read
 *      `colors` (e.g. /matchday) still show swatches.
 *
 * Safe to re-run. Only writes when something actually changes.
 *
 * Usage:
 *   cd web && npx tsx prisma/repair-product-color-tags.ts            # dry run
 *   cd web && npx tsx prisma/repair-product-color-tags.ts --apply    # write changes
 */

import { PrismaClient } from '@prisma/client';
import { cleanColorName } from '../src/lib/colors';
import { parseProductImages, serializeProductImages } from '../src/lib/product-images';

const prisma = new PrismaClient();

function parseColors(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const products = await prisma.adminProduct.findMany({
    select: { id: true, name: true, slug: true, images: true, colors: true },
  });

  let scanned = 0;
  let toUpdate = 0;
  const updates: { id: string; name: string; before: { images: string | null; colors: string | null }; after: { images: string; colors: string } }[] = [];

  for (const p of products) {
    scanned += 1;
    const entries = parseProductImages(p.images);
    const cleanedEntries = entries.map((e) => ({
      ...e,
      color: cleanColorName(e.color) || null,
    }));
    const imagesChanged = cleanedEntries.some((e, i) => (e.color || null) !== (entries[i].color || null));

    const existingColors = parseColors(p.colors).map(cleanColorName).filter(Boolean);
    const entryColors = Array.from(
      new Set(
        cleanedEntries
          .map((e) => cleanColorName(e.color))
          .filter((c) => !!c),
      ),
    );

    // Derive colors[] from image entries only when admin left it blank — never
    // overwrite an explicit admin choice.
    const nextColors = existingColors.length > 0
      ? existingColors
      : entryColors;

    const colorsChanged =
      existingColors.length === 0 && entryColors.length > 0;

    if (!imagesChanged && !colorsChanged) continue;

    toUpdate += 1;
    const nextImagesJson = serializeProductImages(cleanedEntries);
    const nextColorsJson = JSON.stringify(nextColors);
    updates.push({
      id: p.id,
      name: p.name,
      before: { images: p.images, colors: p.colors },
      after: { images: nextImagesJson, colors: nextColorsJson },
    });

    if (apply) {
      await prisma.adminProduct.update({
        where: { id: p.id },
        data: {
          ...(imagesChanged ? { images: nextImagesJson } : {}),
          ...(colorsChanged ? { colors: nextColorsJson } : {}),
        },
      });
    }
  }

  console.log(`Scanned ${scanned} products. ${toUpdate} need updates.`);
  for (const u of updates) {
    console.log(`\n— ${u.name} (${u.id})`);
    console.log(`   images: ${u.before.images}`);
    console.log(`        → ${u.after.images}`);
    console.log(`   colors: ${u.before.colors}`);
    console.log(`        → ${u.after.colors}`);
  }
  if (!apply) {
    console.log('\nDry run — re-run with --apply to write changes.');
  } else {
    console.log('\nDone.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
