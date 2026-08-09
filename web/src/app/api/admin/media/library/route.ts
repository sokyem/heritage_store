import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/auth-guard';

const MEDIA_ROOT = path.join(process.cwd(), 'public', 'media');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const LIBRARY_FOLDERS: { id: string; label: string; relPath: string }[] = [
  { id: 'shopify', label: 'Shopify Import', relPath: 'storefront/shopify' },
  { id: 'storefront', label: 'Storefront', relPath: '' },
];

type LibraryItem = {
  url: string;
  name: string;
  folder: string;
  size: number;
  mtime: number;
};

async function listImages(folderId: string, relPath: string): Promise<LibraryItem[]> {
  const abs = path.join(MEDIA_ROOT, relPath);
  let entries: string[] = [];
  try {
    entries = await readdir(abs);
  } catch {
    return [];
  }

  const items: LibraryItem[] = [];
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const absFile = path.join(abs, entry);
    let stats;
    try {
      stats = await stat(absFile);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    const urlPath = ['/media', relPath, entry].filter(Boolean).join('/').replace(/\/+/g, '/');
    items.push({
      url: encodeURI(urlPath),
      name: entry,
      folder: folderId,
      size: stats.size,
      mtime: stats.mtimeMs,
    });
  }

  // Most recent first.
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

// GET /api/admin/media/library
// Returns local media assets (imported from Shopify or the storefront folder)
// so admins can attach them to products without re-uploading.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const folders = await Promise.all(
    LIBRARY_FOLDERS.map(async (f) => ({
      id: f.id,
      label: f.label,
      items: await listImages(f.id, f.relPath),
    })),
  );

  return NextResponse.json({ folders });
}
