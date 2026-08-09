/**
 * One-time seed endpoint for the Ghana jersey collection.
 *
 * Guarded by ADMIN_RESET_KEY env var. Set this on Railway, then call:
 *   POST /api/admin/seed-jerseys?key=YOUR_SECRET_KEY
 *
 * Inserts (or updates by SKU) the 3 Ghana jerseys into AdminProduct so they
 * become editable from /admin/products.
 *
 * After use, REMOVE ADMIN_RESET_KEY from env to disable.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const JERSEYS = [
  {
    sku: 'AWK-JERSEY-HOME',
    name: 'Ghana Home Jersey',
    description: 'Official Black Stars home jersey — red, gold, green, with the iconic black star at heart.',
    longDescription:
      'Show your pride for the Black Stars with our official home jersey. Crafted from premium breathable performance fabric, featuring the bold Ghana red, gold, and green color scheme with the iconic black star emblem. Perfect for matchday, training, or showing your support wherever you go.',
    category: 'sportswear',
    subcategory: 'home-jersey',
    gender: 'unisex',
    price: 49.99,
    compareAtPrice: 89.99,
    images: JSON.stringify(['/Ghana_jersey_old.webp']),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    colors: JSON.stringify(['Red/Gold/Green']),
    materials: JSON.stringify(['100% Polyester Performance Fabric']),
    tags: JSON.stringify(['ghana', 'jersey', 'world-cup', 'black-stars', 'football', 'soccer', 'home']),
    slug: 'ghana-home-jersey',
    isPublished: true,
    isFeatured: true,
    isNewArrival: true,
    totalStock: 100,
    trackInventory: true,
  },
  {
    sku: 'AWK-JERSEY-AWAY',
    name: 'Ghana Away Jersey',
    description: 'Official Black Stars away jersey — striking white design with red and gold accents.',
    longDescription:
      'Travel with the Black Stars in our official away jersey. A clean white base accented with the bold Ghana red and gold trims, featuring the black star crest. Lightweight, moisture-wicking fabric keeps you cool whether you are watching the match or living your everyday.',
    category: 'sportswear',
    subcategory: 'away-jersey',
    gender: 'unisex',
    price: 49.99,
    compareAtPrice: 89.99,
    images: JSON.stringify(['/Ghana_jersey_old.webp']),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    colors: JSON.stringify(['White/Red/Gold']),
    materials: JSON.stringify(['100% Polyester Performance Fabric']),
    tags: JSON.stringify(['ghana', 'jersey', 'world-cup', 'black-stars', 'football', 'soccer', 'away']),
    slug: 'ghana-away-jersey',
    isPublished: true,
    isFeatured: true,
    isNewArrival: true,
    totalStock: 100,
    trackInventory: true,
  },
  {
    sku: 'AWK-JERSEY-TRAINING',
    name: 'Ghana Training Jersey',
    description: 'Black Stars training jersey — comfortable, breathable, ready for action.',
    longDescription:
      'The Black Stars training jersey is designed for movement. Featuring a relaxed fit, breathable mesh panels, and the unmistakable Ghana flag colorway. Whether you are on the pitch or off, this jersey delivers comfort and pride in equal measure.',
    category: 'sportswear',
    subcategory: 'training-jersey',
    gender: 'unisex',
    price: 39.99,
    compareAtPrice: 69.99,
    images: JSON.stringify(['/Ghana_jersey_old.webp']),
    sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
    colors: JSON.stringify(['Black/Gold']),
    materials: JSON.stringify(['100% Polyester Mesh']),
    tags: JSON.stringify(['ghana', 'jersey', 'training', 'black-stars', 'football', 'soccer']),
    slug: 'ghana-training-jersey',
    isPublished: true,
    isFeatured: true,
    isNewArrival: true,
    totalStock: 100,
    trackInventory: true,
  },
];

export async function POST(req: NextRequest) {
  const RESET_KEY = process.env.ADMIN_RESET_KEY;

  if (!RESET_KEY) {
    return NextResponse.json({ error: 'Endpoint disabled' }, { status: 403 });
  }

  const key = new URL(req.url).searchParams.get('key');
  if (key !== RESET_KEY) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
  }

  try {
    // Ensure a "Ghana Black Stars" collection exists, so the jerseys group
    // visually under one collection in the admin UI.
    const COLLECTION_SLUG = 'ghana-black-stars';
    let collection = await prisma.adminCollection.findUnique({ where: { slug: COLLECTION_SLUG } });
    if (!collection) {
      collection = await prisma.adminCollection.create({
        data: {
          name: 'Ghana Black Stars',
          slug: COLLECTION_SLUG,
          description: 'Official Black Stars jerseys and matchday gear — World Cup edition.',
          image: '/Ghana_jersey_old.webp',
          season: 'WC2026',
          isActive: true,
          sortOrder: 0,
        },
      });
    }

    const results: Array<{ sku: string; action: 'created' | 'updated'; id: string }> = [];

    for (const jersey of JERSEYS) {
      const existing = await prisma.adminProduct.findUnique({ where: { sku: jersey.sku } });
      if (existing) {
        const updated = await prisma.adminProduct.update({
          where: { sku: jersey.sku },
          data: { ...jersey, collectionId: collection.id },
        });
        results.push({ sku: jersey.sku, action: 'updated', id: updated.id });
      } else {
        const created = await prisma.adminProduct.create({
          data: { ...jersey, collectionId: collection.id },
        });
        results.push({ sku: jersey.sku, action: 'created', id: created.id });
      }
    }

    return NextResponse.json({
      success: true,
      collection: { id: collection.id, slug: collection.slug, name: collection.name },
      count: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
