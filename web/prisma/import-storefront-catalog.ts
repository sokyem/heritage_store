import { PrismaClient } from '@prisma/client';
import {
  buildLegacyTags,
  legacyStorefrontProducts,
  mapLegacyCategoryToAdminCategory,
  mapLegacyGender,
  mapLegacySubcategory,
  slugifyStorefrontValue,
} from '../src/lib/storefront-catalog';
import { getImportedStorefrontImage } from '../src/lib/storefront-media';

const prisma = new PrismaClient();

function buildSku(index: number) {
  return `AWK-LGC-${String(index + 1).padStart(3, '0')}`;
}

async function main() {
  const collectionOrder = Array.from(new Set(legacyStorefrontProducts.map((product) => product.category)));
  const collectionByName = new Map<string, { id: string }>();

  for (const [index, name] of collectionOrder.entries()) {
    const collection = await prisma.adminCollection.upsert({
      where: { slug: slugifyStorefrontValue(name) },
      update: {
        name,
        isActive: true,
        sortOrder: index,
      },
      create: {
        name,
        slug: slugifyStorefrontValue(name),
        description: `${name} catalog imported from the legacy storefront showcase.`,
        isActive: true,
        sortOrder: index,
      },
      select: { id: true },
    });
    collectionByName.set(name, collection);
  }

  let created = 0;
  let updated = 0;

  for (const [index, product] of legacyStorefrontProducts.entries()) {
    const slug = slugifyStorefrontValue(product.name);
    const existing = await prisma.adminProduct.findUnique({
      where: { slug },
      select: {
        id: true,
        description: true,
        longDescription: true,
        compareAtPrice: true,
        images: true,
        category: true,
        subcategory: true,
        gender: true,
        tags: true,
        collectionId: true,
        trackInventory: true,
        totalStock: true,
        isPublished: true,
        isFeatured: true,
        isNewArrival: true,
      },
    });

    const payload = {
      sku: buildSku(index),
      name: product.name,
      slug,
      description: existing?.description || product.description,
      longDescription: existing?.longDescription || product.description,
      category: existing?.category || mapLegacyCategoryToAdminCategory(product.category),
      subcategory: existing?.subcategory || mapLegacySubcategory(product.subcategory, product.category),
      gender: existing?.gender || mapLegacyGender(product.category),
      price: product.price,
      compareAtPrice: existing?.compareAtPrice ?? product.compareAt ?? null,
      images: existing?.images || JSON.stringify([getImportedStorefrontImage(product.image) || product.image]),
      trackInventory: existing?.trackInventory ?? false,
      totalStock: existing?.totalStock ?? 0,
      isPublished: existing?.isPublished ?? true,
      isFeatured: existing?.isFeatured ?? false,
      isNewArrival: existing?.isNewArrival ?? product.badge === 'New',
      tags: existing?.tags || buildLegacyTags(product),
      collectionId: existing?.collectionId || collectionByName.get(product.category)?.id || null,
    };

    if (existing) {
      await prisma.adminProduct.update({
        where: { slug },
        data: payload,
      });
      updated += 1;
    } else {
      await prisma.adminProduct.create({
        data: payload,
      });
      created += 1;
    }
  }

  console.log(JSON.stringify({
    collections: collectionOrder.length,
    created,
    updated,
    totalCatalogProducts: legacyStorefrontProducts.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });