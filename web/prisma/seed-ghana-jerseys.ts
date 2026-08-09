import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedGhanaJerseys() {
  try {
    // 1. Find or create Ghana collection
    let collection = await prisma.adminCollection.findFirst({
      where: { slug: 'ghana-jerseys' },
    });

    if (!collection) {
      collection = await prisma.adminCollection.create({
        data: {
          name: 'Ghana Black Stars World Cup Collection',
          slug: 'ghana-jerseys',
          description: 'Official Ghana jerseys for the 2026 World Cup',
          isActive: true,
          sortOrder: 1,
        },
      });
      console.log('✓ Created Ghana collection');
    }

    // 2. Ghana Home Jersey (Yellow with star)
    const homeJersey = await prisma.adminProduct.upsert({
      where: { sku: 'AWK-GH-HOME-001' },
      update: {
        isPublished: true,
        isFeatured: true,
      },
      create: {
        sku: 'AWK-GH-HOME-001',
        name: 'Ghana Home Jersey',
        description: 'Official Ghana Black Stars home jersey - World Cup 2026 Edition',
        longDescription: 'Authentic Ghana Black Stars home jersey featuring the iconic yellow with red and green accents. Perfect for supporters and players alike.',
        category: 'ready-to-wear',
        subcategory: 'jersey',
        gender: 'unisex',
        price: 89.99,
        compareAtPrice: 119.99,
        costPrice: 35.0,
        images: JSON.stringify([
          '/media/storefront/ghana-home-jersey-front.jpg',
          '/media/storefront/ghana-home-jersey-back.jpg',
        ]),
        sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']),
        colors: JSON.stringify(['Yellow']),
        materials: JSON.stringify(['100% Polyester', 'Moisture-Wicking']),
        trackInventory: true,
        totalStock: 50,
        isPublished: true,
        isFeatured: true,
        isNewArrival: false,
        slug: 'ghana-home-jersey',
        tags: JSON.stringify(['ghana', 'jersey', 'world-cup', 'black-stars', 'matchday']),
        collectionId: collection.id,
      },
    });
    console.log('✓ Created/Updated Ghana Home Jersey');

    // 3. Ghana Away Jersey (White)
    const awayJersey = await prisma.adminProduct.upsert({
      where: { sku: 'AWK-GH-AWAY-001' },
      update: {
        isPublished: true,
        isFeatured: true,
      },
      create: {
        sku: 'AWK-GH-AWAY-001',
        name: 'Ghana Away Jersey',
        description: 'Official Ghana Black Stars away jersey - World Cup 2026 Edition',
        longDescription: 'Clean white Ghana Black Stars away jersey with red and gold trim. Official World Cup edition for the modern supporter.',
        category: 'ready-to-wear',
        subcategory: 'jersey',
        gender: 'unisex',
        price: 89.99,
        compareAtPrice: 119.99,
        costPrice: 35.0,
        images: JSON.stringify([
          '/media/storefront/ghana-away-jersey-front.jpg',
          '/media/storefront/ghana-away-jersey-back.jpg',
        ]),
        sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']),
        colors: JSON.stringify(['White']),
        materials: JSON.stringify(['100% Polyester', 'Moisture-Wicking']),
        trackInventory: true,
        totalStock: 50,
        isPublished: true,
        isFeatured: true,
        isNewArrival: false,
        slug: 'ghana-away-jersey',
        tags: JSON.stringify(['ghana', 'jersey', 'world-cup', 'black-stars', 'matchday']),
        collectionId: collection.id,
      },
    });
    console.log('✓ Created/Updated Ghana Away Jersey');

    // 4. Ghana Training Jersey (Yellow)
    const trainingJersey = await prisma.adminProduct.upsert({
      where: { sku: 'AWK-GH-TRAINING-001' },
      update: {
        isPublished: true,
      },
      create: {
        sku: 'AWK-GH-TRAINING-001',
        name: 'Ghana Training Jersey',
        description: 'Ghana Black Stars training jersey - Performance Edition',
        longDescription: 'Premium training jersey designed for comfort and performance. Perfect for practice, training, or casual wear.',
        category: 'ready-to-wear',
        subcategory: 'jersey',
        gender: 'unisex',
        price: 69.99,
        compareAtPrice: 99.99,
        costPrice: 28.0,
        images: JSON.stringify([
          '/media/storefront/ghana-training-jersey-front.jpg',
          '/media/storefront/ghana-training-jersey-back.jpg',
        ]),
        sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']),
        colors: JSON.stringify(['Yellow']),
        materials: JSON.stringify(['92% Polyester', '8% Spandex', 'Moisture-Wicking']),
        trackInventory: true,
        totalStock: 75,
        isPublished: true,
        isFeatured: false,
        isNewArrival: false,
        slug: 'ghana-training-jersey',
        tags: JSON.stringify(['ghana', 'jersey', 'training', 'black-stars', 'performance']),
        collectionId: collection.id,
      },
    });
    console.log('✓ Created/Updated Ghana Training Jersey');

    console.log('\n✅ Ghana jerseys seeded successfully!');
    console.log(`Collection ID: ${collection.id}`);
    console.log(`- Home Jersey: ${homeJersey.id}`);
    console.log(`- Away Jersey: ${awayJersey.id}`);
    console.log(`- Training Jersey: ${trainingJersey.id}`);
  } catch (err) {
    console.error('Error seeding Ghana jerseys:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedGhanaJerseys();
