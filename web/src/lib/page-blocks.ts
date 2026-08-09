/**
 * Block schema for the Pages CMS. Each block is a discriminated union
 * by `type`. Add new block types here and they will automatically be
 * available in the admin editor and the public renderer.
 */

import { z } from 'zod';

export const HeroBlockSchema = z.object({
  type: z.literal('hero'),
  eyebrow: z.string().default(''),
  title: z.string().default(''),
  subtitle: z.string().default(''),
  imageUrl: z.string().default(''),
  ctaLabel: z.string().default(''),
  ctaHref: z.string().default(''),
  align: z.enum(['left', 'center']).default('center'),
});

export const RichTextBlockSchema = z.object({
  type: z.literal('richText'),
  html: z.string().default(''),
  maxWidth: z.enum(['narrow', 'medium', 'wide']).default('medium'),
});

export const ImageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().default(''),
  alt: z.string().default(''),
  caption: z.string().default(''),
  width: z.enum(['contained', 'full']).default('contained'),
});

export const TwoColumnBlockSchema = z.object({
  type: z.literal('twoColumn'),
  leftTitle: z.string().default(''),
  leftBody: z.string().default(''),
  rightTitle: z.string().default(''),
  rightBody: z.string().default(''),
  imagePosition: z.enum(['none', 'left', 'right']).default('none'),
  imageUrl: z.string().default(''),
});

export const FeatureGridBlockSchema = z.object({
  type: z.literal('featureGrid'),
  title: z.string().default(''),
  items: z
    .array(
      z.object({
        icon: z.string().default(''),
        title: z.string().default(''),
        body: z.string().default(''),
      }),
    )
    .default([]),
});

export const FaqBlockSchema = z.object({
  type: z.literal('faq'),
  title: z.string().default('Frequently Asked'),
  items: z
    .array(
      z.object({
        question: z.string().default(''),
        answer: z.string().default(''),
      }),
    )
    .default([]),
});

export const CtaBlockSchema = z.object({
  type: z.literal('cta'),
  title: z.string().default(''),
  body: z.string().default(''),
  ctaLabel: z.string().default(''),
  ctaHref: z.string().default(''),
  variant: z.enum(['light', 'dark', 'accent']).default('dark'),
});

export const ProductsRowBlockSchema = z.object({
  type: z.literal('productsRow'),
  title: z.string().default(''),
  collectionSlug: z.string().default(''),
  limit: z.number().int().min(1).max(24).default(4),
});

export const SpacerBlockSchema = z.object({
  type: z.literal('spacer'),
  size: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
});

export const PageBlockSchema = z.discriminatedUnion('type', [
  HeroBlockSchema,
  RichTextBlockSchema,
  ImageBlockSchema,
  TwoColumnBlockSchema,
  FeatureGridBlockSchema,
  FaqBlockSchema,
  CtaBlockSchema,
  ProductsRowBlockSchema,
  SpacerBlockSchema,
]);

export const PageBlocksSchema = z.array(PageBlockSchema);

export type PageBlock = z.infer<typeof PageBlockSchema>;
export type PageBlockType = PageBlock['type'];

export const BLOCK_DEFAULTS: Record<PageBlockType, PageBlock> = {
  hero: { type: 'hero', eyebrow: '', title: 'New Hero Heading', subtitle: '', imageUrl: '', ctaLabel: '', ctaHref: '', align: 'center' },
  richText: { type: 'richText', html: '<p>Edit this text…</p>', maxWidth: 'medium' },
  image: { type: 'image', url: '', alt: '', caption: '', width: 'contained' },
  twoColumn: { type: 'twoColumn', leftTitle: '', leftBody: '', rightTitle: '', rightBody: '', imagePosition: 'none', imageUrl: '' },
  featureGrid: { type: 'featureGrid', title: '', items: [] },
  faq: { type: 'faq', title: 'Frequently Asked', items: [] },
  cta: { type: 'cta', title: '', body: '', ctaLabel: '', ctaHref: '', variant: 'dark' },
  productsRow: { type: 'productsRow', title: '', collectionSlug: '', limit: 4 },
  spacer: { type: 'spacer', size: 'md' },
};

export const BLOCK_LABELS: Record<PageBlockType, string> = {
  hero: 'Hero',
  richText: 'Rich Text',
  image: 'Image',
  twoColumn: 'Two Column',
  featureGrid: 'Feature Grid',
  faq: 'FAQ',
  cta: 'Call to Action',
  productsRow: 'Products Row',
  spacer: 'Spacer',
};
