import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageBlocksSchema } from '@/lib/page-blocks';
import { BlocksRenderer } from '@/components/BlockRenderer';

export const revalidate = 60;

async function loadPage(slug: string) {
  try {
    return await prisma.page.findFirst({
      where: { slug, status: 'published' },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug.join('/'));
  if (!page) return {};
  return {
    title: page.metaTitle || page.title,
    description: page.metaDesc || page.description || undefined,
    openGraph: page.ogImage ? { images: [{ url: page.ogImage }] } : undefined,
  };
}

export default async function CmsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = await loadPage(slug.join('/'));
  if (!page) notFound();

  const parsed = PageBlocksSchema.safeParse(page.blocks);
  const blocks = parsed.success ? parsed.data : [];

  return <BlocksRenderer blocks={blocks} />;
}
