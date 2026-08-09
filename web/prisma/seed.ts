import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample users
  const user1 = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      name: 'Sarah Johnson',
    },
  });

  const founder = await prisma.user.upsert({
    where: { email: 'founder@example.com' },
    update: {},
    create: {
      email: 'founder@example.com',
      name: 'Founder',
      role: 'founder',
    },
  });

  // Create sample products
  const product1 = await prisma.product.upsert({
    where: { id: 'prod1' },
    update: {},
    create: {
      id: 'prod1',
      name: 'Midnight Blue Signature',
      price: 680,
      description: 'Made to measure, Event wear, Luxury finish',
    },
  });

  const product2 = await prisma.product.upsert({
    where: { id: 'prod2' },
    update: {},
    create: {
      id: 'prod2',
      name: 'Blue evening look',
      price: 550,
      description: 'Shop now or convert to a custom fit request.',
    },
  });

  // Create sample orders
  await prisma.order.upsert({
    where: { id: 'order1' },
    update: {},
    create: {
      id: 'order1',
      userId: user1.id,
      productId: product1.id,
      status: 'in_production',
      customNotes: 'Studio K',
    },
  });

  // Create sample designers
  await prisma.designer.upsert({
    where: { id: 'designer1' },
    update: {},
    create: {
      id: 'designer1',
      name: 'Studio K',
      specialty: 'Bridal',
      status: 'busy',
    },
  });

  await prisma.designer.upsert({
    where: { id: 'designer2' },
    update: {},
    create: {
      id: 'designer2',
      name: 'Atelier Nhyira',
      specialty: 'Evening Wear',
      status: 'available',
    },
  });

  // Create Matchday collection for soccer jerseys
  const matchdayCollection = await prisma.adminCollection.upsert({
    where: { slug: 'matchday' },
    update: {
      name: 'Matchday by Awula K',
      description: 'Premium soccer jerseys and athletic wear',
      isActive: true,
    },
    create: {
      name: 'Matchday by Awula K',
      slug: 'matchday',
      description: 'Premium soccer jerseys and athletic wear',
      isActive: true,
      sortOrder: 0,
    },
  });

  console.log('Database seeded successfully with Matchday collection:', matchdayCollection);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });