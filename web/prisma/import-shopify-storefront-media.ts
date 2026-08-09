import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  legacyStorefrontProducts,
  slugifyStorefrontValue,
} from '../src/lib/storefront-catalog';
import { normalizeLegacyStorefrontSourceKey } from '../src/lib/storefront-media';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const manifestFilePath = path.join(process.cwd(), 'src', 'lib', 'generated', 'storefront-image-manifest.json');
const publicMediaRoot = path.join(process.cwd(), 'public', 'media', 'storefront', 'shopify');

type ShopifyImageNode = {
  url: string;
  altText?: string | null;
};

type ShopifyProductNode = {
  title: string;
  handle: string;
  featuredImage?: ShopifyImageNode | null;
  images: { nodes: ShopifyImageNode[] };
};

type ShopifyCollectionNode = {
  title: string;
  handle: string;
  image?: ShopifyImageNode | null;
};

const legacyCollectionTargets = [
  {
    title: 'Women',
    slug: 'women',
    legacyUrl: 'https://www.awulak.com/cdn/shop/collections/9BD1D3EC-F2F3-4AD0-B513-704793C6900D.jpg?v=1726203533&width=1200',
  },
  {
    title: 'Men',
    slug: 'men',
    legacyUrl: 'https://www.awulak.com/cdn/shop/files/9E8033A2-2F68-4AFD-9D74-810A795A75D5.jpg?v=1726275729&width=1200',
  },
  {
    title: 'Prom',
    slug: 'prom',
    legacyUrl: 'https://www.awulak.com/cdn/shop/files/5C031CF7-F2B7-4345-92C1-13E9B387CDA2.jpg?v=1768497037&width=1200',
  },
  {
    title: 'Accessories',
    slug: 'accessories',
    legacyUrl: 'https://www.awulak.com/cdn/shop/files/IMG_3566.heic?v=1725937102&width=1200',
  },
];

function ensureShopDomain(value: string) {
  const normalized = value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return normalized.includes('.') ? normalized : `${normalized}.myshopify.com`;
}

function normalizeName(value: string) {
  return slugifyStorefrontValue(value)
    .replace(/-dress$/u, '')
    .replace(/-shirt$/u, '')
    .replace(/-men$/u, '')
    .replace(/-women$/u, '');
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function fileExtensionFromContentType(contentType?: string | null) {
  const normalized = (contentType || '').toLowerCase().split(';')[0].trim();
  switch (normalized) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return null;
  }
}

function fileExtensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
    return extension || null;
  } catch {
    return null;
  }
}

async function shopifyGraphql<T>(shopDomain: string, accessToken: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API request failed with ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }

  if (!payload.data) {
    throw new Error('Shopify API returned no data');
  }

  return payload.data;
}

async function fetchAllShopifyProducts(shopDomain: string, accessToken: string) {
  const products: ShopifyProductNode[] = [];
  let cursor: string | null = null;

  do {
    const data = await shopifyGraphql<{
      products: {
        nodes: ShopifyProductNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      shopDomain,
      accessToken,
      `query Products($cursor: String) {
        products(first: 100, after: $cursor) {
          nodes {
            title
            handle
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              nodes {
                url
                altText
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { cursor }
    );

    products.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return products;
}

async function fetchAllShopifyCollections(shopDomain: string, accessToken: string) {
  const collections: ShopifyCollectionNode[] = [];
  let cursor: string | null = null;

  do {
    const data = await shopifyGraphql<{
      collections: {
        nodes: ShopifyCollectionNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      shopDomain,
      accessToken,
      `query Collections($cursor: String) {
        collections(first: 100, after: $cursor) {
          nodes {
            title
            handle
            image {
              url
              altText
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { cursor }
    );

    collections.push(...data.collections.nodes);
    cursor = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (cursor);

  return collections;
}

async function downloadRemoteImage(url: string, relativeDir: string, baseFileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download image ${url}: ${response.status} ${response.statusText}`);
  }

  const extension = fileExtensionFromUrl(url) || fileExtensionFromContentType(response.headers.get('content-type')) || 'jpg';
  const relativeFilePath = path.posix.join('media', 'storefront', 'shopify', relativeDir, `${baseFileName}.${extension}`);
  const absoluteFilePath = path.join(process.cwd(), 'public', relativeFilePath);

  await mkdir(path.dirname(absoluteFilePath), { recursive: true });
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(absoluteFilePath, Buffer.from(arrayBuffer));

  return `/${relativeFilePath}`;
}

async function syncAdminData(params: {
  productImagesBySlug: Map<string, string[]>;
  collectionImagesBySlug: Map<string, string>;
}) {
  if (!process.env.DATABASE_URL) {
    return { skipped: true, updatedProducts: 0, updatedCollections: 0 };
  }

  const prisma = new PrismaClient();

  try {
    let updatedProducts = 0;
    for (const [slug, images] of params.productImagesBySlug.entries()) {
      await prisma.adminProduct.updateMany({
        where: { slug },
        data: { images: JSON.stringify(images) },
      });
      updatedProducts += 1;
    }

    let updatedCollections = 0;
    for (const [slug, image] of params.collectionImagesBySlug.entries()) {
      await prisma.adminCollection.updateMany({
        where: { slug },
        data: { image },
      });
      updatedCollections += 1;
    }

    return { skipped: false, updatedProducts, updatedCollections };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const rawShopDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_ADMIN_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!rawShopDomain || !accessToken) {
    throw new Error('Missing Shopify credentials. Set SHOPIFY_STORE_DOMAIN (your myshopify domain) and SHOPIFY_ADMIN_ACCESS_TOKEN.');
  }

  const shopDomain = ensureShopDomain(rawShopDomain);
  const [shopifyProducts, shopifyCollections] = await Promise.all([
    fetchAllShopifyProducts(shopDomain, accessToken),
    fetchAllShopifyCollections(shopDomain, accessToken),
  ]);

  const productsByName = new Map<string, ShopifyProductNode>();
  for (const product of shopifyProducts) {
    productsByName.set(normalizeName(product.title), product);
  }

  const collectionsByName = new Map<string, ShopifyCollectionNode>();
  for (const collection of shopifyCollections) {
    collectionsByName.set(normalizeName(collection.title), collection);
    collectionsByName.set(normalizeName(collection.handle), collection);
  }

  const manifest: Record<string, string> = {};
  const productImagesBySlug = new Map<string, string[]>();
  const collectionImagesBySlug = new Map<string, string>();
  const unmatchedProducts: string[] = [];
  const unmatchedCollections: string[] = [];

  await mkdir(publicMediaRoot, { recursive: true });

  for (const product of legacyStorefrontProducts) {
    const normalizedLegacyName = normalizeName(product.name);
    const shopifyProduct = productsByName.get(normalizedLegacyName);
    if (!shopifyProduct) {
      unmatchedProducts.push(product.name);
      continue;
    }

    const slug = slugifyStorefrontValue(product.name);
    const imageUrls = unique([
      shopifyProduct.featuredImage?.url,
      ...shopifyProduct.images.nodes.map((image) => image.url),
    ].filter((value): value is string => Boolean(value)));

    if (!imageUrls.length) {
      unmatchedProducts.push(`${product.name} (no Shopify images)`);
      continue;
    }

    const localImages: string[] = [];
    for (const [index, imageUrl] of imageUrls.entries()) {
      const localPath = await downloadRemoteImage(imageUrl, 'products', `${slug}-${index + 1}`);
      localImages.push(localPath);
    }

    productImagesBySlug.set(slug, localImages);

    const legacyKey = normalizeLegacyStorefrontSourceKey(product.image);
    if (legacyKey) {
      manifest[legacyKey] = localImages[0];
    }
  }

  for (const collectionTarget of legacyCollectionTargets) {
    const shopifyCollection =
      collectionsByName.get(normalizeName(collectionTarget.title)) ||
      collectionsByName.get(normalizeName(collectionTarget.slug));

    if (!shopifyCollection?.image?.url) {
      unmatchedCollections.push(collectionTarget.title);
      continue;
    }

    const localPath = await downloadRemoteImage(shopifyCollection.image.url, 'collections', collectionTarget.slug);
    collectionImagesBySlug.set(collectionTarget.slug, localPath);

    const legacyKey = normalizeLegacyStorefrontSourceKey(collectionTarget.legacyUrl);
    if (legacyKey) {
      manifest[legacyKey] = localPath;
    }
  }

  await mkdir(path.dirname(manifestFilePath), { recursive: true });
  await writeFile(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const dbSync = await syncAdminData({ productImagesBySlug, collectionImagesBySlug });

  console.log(
    JSON.stringify(
      {
        shopDomain,
        importedProductImages: productImagesBySlug.size,
        importedCollectionImages: collectionImagesBySlug.size,
        manifestEntries: Object.keys(manifest).length,
        unmatchedProducts,
        unmatchedCollections,
        dbSync,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});