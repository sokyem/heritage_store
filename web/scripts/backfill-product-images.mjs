import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function firstImage(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
    return null;
  } catch {
    return typeof raw === 'string' && raw.startsWith('/') ? raw : null;
  }
}

async function main() {
  const prods = await prisma.product.findMany({ where: { image: null } });
  let fixed = 0;
  for (const prod of prods) {
    let ap = await prisma.adminProduct.findFirst({
      where: { name: { equals: prod.name, mode: 'insensitive' } },
      select: { images: true },
    });
    if (!ap) {
      ap = await prisma.adminProduct.findFirst({
        where: { name: { contains: prod.name, mode: 'insensitive' } },
        select: { images: true },
      });
    }
    if (!ap) {
      const tokens = prod.name.split(/\s+/).filter((t) => t.length >= 4).slice(0, 4);
      for (const t of tokens) {
        ap = await prisma.adminProduct.findFirst({
          where: { name: { contains: t, mode: 'insensitive' } },
          select: { images: true },
        });
        if (ap) break;
      }
    }
    const img = firstImage(ap?.images);
    if (img) {
      await prisma.product.update({ where: { id: prod.id }, data: { image: img } });
      console.log('✓', prod.name, '→', img.slice(0, 70));
      fixed++;
    } else {
      console.log('✗ no match for:', prod.name);
    }
  }
  console.log(`Backfilled ${fixed} of ${prods.length}`);
}

main().finally(() => prisma.$disconnect());
