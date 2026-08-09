import Link from 'next/link';
import type { PageBlock } from '@/lib/page-blocks';

/**
 * Renders one CMS block. Used by the admin preview and by the public
 * page route. Server component — safe to use Server-only data here if
 * we later extend ProductsRow to fetch real products.
 */
export function BlockRenderer({ block }: { block: PageBlock }) {
  switch (block.type) {
    case 'hero':
      return (
        <section
          className={`relative overflow-hidden ${block.imageUrl ? 'text-white' : ''}`}
          style={{
            background: block.imageUrl
              ? `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.45)), url('${block.imageUrl}') center/cover`
              : 'var(--aw-cream)',
          }}
        >
          <div
            className={`max-w-6xl mx-auto px-6 py-24 sm:py-32 ${
              block.align === 'left' ? 'text-left' : 'text-center'
            }`}
          >
            {block.eyebrow && (
              <p className="text-xs uppercase tracking-[0.3em] mb-4 opacity-80">{block.eyebrow}</p>
            )}
            {block.title && (
              <h1
                className="text-4xl sm:text-6xl font-medium leading-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {block.title}
              </h1>
            )}
            {block.subtitle && (
              <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg opacity-90">
                {block.subtitle}
              </p>
            )}
            {block.ctaLabel && block.ctaHref && (
              <Link
                href={block.ctaHref}
                className="inline-block mt-8 px-7 py-3 bg-[var(--aw-navy)] text-white text-sm uppercase tracking-widest"
              >
                {block.ctaLabel}
              </Link>
            )}
          </div>
        </section>
      );

    case 'richText': {
      const widthClass =
        block.maxWidth === 'narrow'
          ? 'max-w-2xl'
          : block.maxWidth === 'wide'
            ? 'max-w-5xl'
            : 'max-w-3xl';
      return (
        <section className={`${widthClass} mx-auto px-6 py-12`}>
          <div
            className="prose prose-neutral max-w-none"
            // eslint-disable-next-line react/no-danger -- admin-authored content
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        </section>
      );
    }

    case 'image':
      return (
        <section className={block.width === 'full' ? '' : 'max-w-5xl mx-auto px-6'}>
          <figure className="py-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.url} alt={block.alt} className="w-full h-auto" />
            {block.caption && (
              <figcaption className="text-xs text-center text-[var(--aw-text-light)] mt-3">
                {block.caption}
              </figcaption>
            )}
          </figure>
        </section>
      );

    case 'twoColumn':
      return (
        <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10 items-start">
          <div>
            {block.imagePosition === 'left' && block.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.imageUrl} alt="" className="w-full mb-6" />
            )}
            {block.leftTitle && (
              <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                {block.leftTitle}
              </h2>
            )}
            {block.leftBody && <p className="text-[var(--aw-text-light)]">{block.leftBody}</p>}
          </div>
          <div>
            {block.imagePosition === 'right' && block.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.imageUrl} alt="" className="w-full mb-6" />
            )}
            {block.rightTitle && (
              <h2 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                {block.rightTitle}
              </h2>
            )}
            {block.rightBody && <p className="text-[var(--aw-text-light)]">{block.rightBody}</p>}
          </div>
        </section>
      );

    case 'featureGrid':
      return (
        <section className="max-w-6xl mx-auto px-6 py-16">
          {block.title && (
            <h2
              className="text-3xl text-center mb-10"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {block.title}
            </h2>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {block.items.map((item, idx) => (
              <div key={idx} className="border border-[var(--aw-border-strong)] p-6 bg-white">
                {item.icon && <div className="text-2xl mb-3">{item.icon}</div>}
                <h3 className="font-medium mb-2">{item.title}</h3>
                <p className="text-sm text-[var(--aw-text-light)]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case 'faq':
      return (
        <section className="max-w-3xl mx-auto px-6 py-16">
          {block.title && (
            <h2 className="text-3xl mb-8" style={{ fontFamily: 'var(--font-heading)' }}>
              {block.title}
            </h2>
          )}
          <div className="space-y-4">
            {block.items.map((item, idx) => (
              <details
                key={idx}
                className="border border-[var(--aw-border-strong)] bg-white p-4 group"
              >
                <summary className="cursor-pointer font-medium">{item.question}</summary>
                <p className="mt-3 text-sm text-[var(--aw-text-light)] whitespace-pre-wrap">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      );

    case 'cta': {
      const palette =
        block.variant === 'light'
          ? { bg: 'var(--aw-cream)', fg: 'var(--aw-text)', btn: 'var(--aw-navy)', btnFg: '#fff' }
          : block.variant === 'accent'
            ? { bg: 'var(--aw-gold-deep)', fg: '#fff', btn: '#fff', btnFg: 'var(--aw-gold-deep)' }
            : { bg: 'var(--aw-navy)', fg: '#fff', btn: '#fff', btnFg: 'var(--aw-navy)' };
      return (
        <section style={{ background: palette.bg, color: palette.fg }}>
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            {block.title && (
              <h2 className="text-3xl mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                {block.title}
              </h2>
            )}
            {block.body && <p className="opacity-90 mb-6">{block.body}</p>}
            {block.ctaLabel && block.ctaHref && (
              <Link
                href={block.ctaHref}
                className="inline-block px-7 py-3 text-sm uppercase tracking-widest"
                style={{ background: palette.btn, color: palette.btnFg }}
              >
                {block.ctaLabel}
              </Link>
            )}
          </div>
        </section>
      );
    }

    case 'productsRow':
      return (
        <section className="max-w-6xl mx-auto px-6 py-12">
          {block.title && (
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
              {block.title}
            </h2>
          )}
          <p className="text-xs text-[var(--aw-text-light)]">
            Showing up to {block.limit} products from collection &quot;{block.collectionSlug || '—'}&quot;.
          </p>
        </section>
      );

    case 'spacer': {
      const h = { sm: '24px', md: '48px', lg: '96px', xl: '160px' }[block.size];
      return <div style={{ height: h }} />;
    }

    default:
      return null;
  }
}

export function BlocksRenderer({ blocks }: { blocks: PageBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} />
      ))}
    </>
  );
}
