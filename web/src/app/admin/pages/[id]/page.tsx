'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { BLOCK_DEFAULTS, BLOCK_LABELS, type PageBlock, type PageBlockType } from '@/lib/page-blocks';

interface PageRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  blocks: PageBlock[];
  status: 'draft' | 'published';
  publishedAt: string | null;
  metaTitle: string | null;
  metaDesc: string | null;
  ogImage: string | null;
  revisions: { id: string; createdAt: string; createdBy: string | null; note: string | null; title: string }[];
}

export default function PageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [page, setPage] = useState<PageRecord | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [activeBlock, setActiveBlock] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/admin/pages/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.page) {
          setPage(d.page);
          setBlocks(Array.isArray(d.page.blocks) ? d.page.blocks : []);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function addBlock(type: PageBlockType) {
    setBlocks((b) => [...b, structuredClone(BLOCK_DEFAULTS[type])]);
    setShowAdd(false);
    setActiveBlock(blocks.length);
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks((b) => {
      const next = [...b];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return b;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function removeBlock(idx: number) {
    if (!confirm('Remove this block?')) return;
    setBlocks((b) => b.filter((_, i) => i !== idx));
    if (activeBlock === idx) setActiveBlock(null);
  }

  function updateBlock(idx: number, patch: Partial<PageBlock>) {
    setBlocks((b) => b.map((blk, i) => (i === idx ? ({ ...blk, ...patch } as PageBlock) : blk)));
  }

  async function save(opts: { publish?: boolean; revisionNote?: string } = {}) {
    if (!page) return;
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        title: page.title,
        slug: page.slug,
        description: page.description,
        metaTitle: page.metaTitle,
        metaDesc: page.metaDesc,
        ogImage: page.ogImage,
        blocks,
      };
      if (opts.publish !== undefined) body.status = opts.publish ? 'published' : 'draft';
      if (opts.revisionNote) body.revisionNote = opts.revisionNote;

      const res = await fetch(`/api/admin/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setPage((p) => (p ? { ...p, ...data.page } : p));
      setMsg({ type: 'ok', text: opts.publish ? 'Published.' : 'Saved.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function deletePage() {
    if (!page) return;
    if (!confirm(`Delete page "${page.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/pages/${id}`, { method: 'DELETE' });
    if (res.ok) window.location.href = '/admin/pages';
  }

  if (loading) return <div className="p-8 text-sm text-[var(--aw-text-light)]">Loading…</div>;
  if (!page) return <div className="p-8 text-sm text-red-700">Page not found.</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Top bar */}
      <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <Link href="/admin/pages" className="text-xs text-[var(--aw-text-light)] underline">
            ← All pages
          </Link>
          <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Edit: {page.title}
          </h1>
          <p className="text-xs text-[var(--aw-text-light)] mt-1 font-mono">/p/{page.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={deletePage}
            className="px-3 py-2 text-xs text-red-700 border border-red-300 hover:bg-red-50"
          >
            Delete
          </button>
          <a
            href={`/p/${page.slug}`}
            target="_blank"
            rel="noopener"
            className="px-3 py-2 text-xs border border-[var(--aw-border-strong)] hover:bg-[var(--aw-cream)]"
          >
            Preview ↗
          </a>
          <button
            onClick={() => save({ publish: false })}
            disabled={saving}
            className="px-4 py-2 text-sm border border-[var(--aw-border-strong)] disabled:opacity-60"
          >
            Save draft
          </button>
          <button
            onClick={() => save({ publish: true })}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
          >
            {page.status === 'published' ? 'Update published' : 'Publish'}
          </button>
        </div>
      </header>

      {msg && (
        <div
          className={`p-3 text-sm mb-4 ${
            msg.type === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: page meta + block list ───────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-[var(--aw-border-strong)] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-3">
              Page details
            </h2>
            <div className="space-y-3">
              <Input
                label="Title"
                value={page.title}
                onChange={(v) => setPage({ ...page, title: v })}
              />
              <Input
                label="Slug"
                value={page.slug}
                onChange={(v) => setPage({ ...page, slug: v.toLowerCase() })}
                mono
              />
              <Input
                label="Short description (internal)"
                value={page.description ?? ''}
                onChange={(v) => setPage({ ...page, description: v })}
              />
              <details>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider">
                  SEO
                </summary>
                <div className="mt-3 space-y-3">
                  <Input
                    label="Meta title"
                    value={page.metaTitle ?? ''}
                    onChange={(v) => setPage({ ...page, metaTitle: v })}
                  />
                  <Input
                    label="Meta description"
                    value={page.metaDesc ?? ''}
                    onChange={(v) => setPage({ ...page, metaDesc: v })}
                  />
                  <Input
                    label="Open Graph image URL"
                    value={page.ogImage ?? ''}
                    onChange={(v) => setPage({ ...page, ogImage: v })}
                  />
                </div>
              </details>
            </div>
          </section>

          <section className="bg-white border border-[var(--aw-border-strong)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-navy)]">
                Blocks ({blocks.length})
              </h2>
              <button
                onClick={() => setShowAdd((s) => !s)}
                className="text-xs px-3 py-1 bg-[var(--aw-navy)] text-white"
              >
                + Add block
              </button>
            </div>

            {showAdd && (
              <div className="mb-4 p-3 bg-[var(--aw-cream)] grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(BLOCK_LABELS) as PageBlockType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => addBlock(t)}
                    className="px-3 py-2 text-xs bg-white border border-[var(--aw-border-strong)] hover:bg-[var(--aw-navy)] hover:text-white text-left"
                  >
                    {BLOCK_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

            {blocks.length === 0 ? (
              <p className="text-sm text-[var(--aw-text-light)] py-6 text-center">
                No blocks yet. Click <strong>+ Add block</strong> to start building.
              </p>
            ) : (
              <ul className="space-y-2">
                {blocks.map((b, i) => (
                  <li
                    key={i}
                    className={`border ${
                      activeBlock === i
                        ? 'border-[var(--aw-navy)] bg-[var(--aw-cream)]'
                        : 'border-[var(--aw-border-strong)]'
                    }`}
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 cursor-pointer"
                      onClick={() => setActiveBlock(activeBlock === i ? null : i)}
                    >
                      <span className="text-sm font-medium">
                        {i + 1}. {BLOCK_LABELS[b.type]}
                        <span className="ml-2 text-xs text-[var(--aw-text-light)]">
                          {summarize(b)}
                        </span>
                      </span>
                      <span className="flex gap-1">
                        <IconBtn
                          title="Move up"
                          disabled={i === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlock(i, -1);
                          }}
                        >
                          ↑
                        </IconBtn>
                        <IconBtn
                          title="Move down"
                          disabled={i === blocks.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlock(i, 1);
                          }}
                        >
                          ↓
                        </IconBtn>
                        <IconBtn
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBlock(i);
                          }}
                        >
                          ✕
                        </IconBtn>
                      </span>
                    </div>
                    {activeBlock === i && (
                      <div className="px-3 pb-3 pt-1 border-t border-[var(--aw-border)] bg-white">
                        <BlockForm block={b} onChange={(patch) => updateBlock(i, patch)} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Right: status + revisions ──────────────────────── */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="sticky top-6 space-y-4">
            <div className="bg-white border border-[var(--aw-border-strong)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-3">
                Status
              </h3>
              <p className="text-sm">
                <span
                  className={`inline-block px-2 py-0.5 text-[10px] uppercase ${
                    page.status === 'published'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {page.status}
                </span>
              </p>
              {page.publishedAt && (
                <p className="text-xs text-[var(--aw-text-light)] mt-2">
                  Published {new Date(page.publishedAt).toLocaleString()}
                </p>
              )}
            </div>

            {page.revisions.length > 0 && (
              <div className="bg-white border border-[var(--aw-border-strong)] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-3">
                  Recent revisions
                </h3>
                <ul className="space-y-2 text-xs">
                  {page.revisions.map((r) => (
                    <li key={r.id} className="border-l-2 border-[var(--aw-border)] pl-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-[var(--aw-text-light)]">
                        {new Date(r.createdAt).toLocaleString()}
                        {r.createdBy ? ` · ${r.createdBy}` : ''}
                      </div>
                      {r.note && <div className="italic">{r.note}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────── */

function Input({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider block mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider block mb-1">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider block mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 text-xs border border-[var(--aw-border-strong)] bg-white disabled:opacity-30 hover:bg-[var(--aw-cream)]"
    >
      {children}
    </button>
  );
}

function summarize(b: PageBlock): string {
  switch (b.type) {
    case 'hero':
      return b.title || '(empty)';
    case 'richText':
      return b.html.replace(/<[^>]+>/g, '').slice(0, 40);
    case 'image':
      return b.url || '(no image)';
    case 'cta':
      return b.title || '(no title)';
    case 'twoColumn':
      return b.leftTitle || b.rightTitle || '';
    case 'featureGrid':
      return `${b.items.length} item${b.items.length === 1 ? '' : 's'}`;
    case 'faq':
      return `${b.items.length} question${b.items.length === 1 ? '' : 's'}`;
    case 'productsRow':
      return b.collectionSlug ? `from ${b.collectionSlug}` : '';
    case 'spacer':
      return b.size;
    default:
      return '';
  }
}

function BlockForm({ block, onChange }: { block: PageBlock; onChange: (p: Partial<PageBlock>) => void }) {
  switch (block.type) {
    case 'hero':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Eyebrow (small text above title)" value={block.eyebrow} onChange={(v) => onChange({ eyebrow: v } as Partial<PageBlock>)} />
          <Input label="Title" value={block.title} onChange={(v) => onChange({ title: v } as Partial<PageBlock>)} />
          <Textarea label="Subtitle" value={block.subtitle} onChange={(v) => onChange({ subtitle: v } as Partial<PageBlock>)} />
          <Input label="Background image URL" value={block.imageUrl} onChange={(v) => onChange({ imageUrl: v } as Partial<PageBlock>)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CTA label" value={block.ctaLabel} onChange={(v) => onChange({ ctaLabel: v } as Partial<PageBlock>)} />
            <Input label="CTA link" value={block.ctaHref} onChange={(v) => onChange({ ctaHref: v } as Partial<PageBlock>)} />
          </div>
          <Select label="Alignment" value={block.align} onChange={(v) => onChange({ align: v } as Partial<PageBlock>)} options={['center', 'left']} />
        </div>
      );

    case 'richText':
      return (
        <div className="space-y-3 pt-3">
          <Textarea label="HTML content (basic HTML allowed)" rows={8} value={block.html} onChange={(v) => onChange({ html: v } as Partial<PageBlock>)} />
          <Select label="Max width" value={block.maxWidth} onChange={(v) => onChange({ maxWidth: v } as Partial<PageBlock>)} options={['narrow', 'medium', 'wide']} />
        </div>
      );

    case 'image':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Image URL" value={block.url} onChange={(v) => onChange({ url: v } as Partial<PageBlock>)} />
          <Input label="Alt text" value={block.alt} onChange={(v) => onChange({ alt: v } as Partial<PageBlock>)} />
          <Input label="Caption (optional)" value={block.caption} onChange={(v) => onChange({ caption: v } as Partial<PageBlock>)} />
          <Select label="Width" value={block.width} onChange={(v) => onChange({ width: v } as Partial<PageBlock>)} options={['contained', 'full']} />
        </div>
      );

    case 'twoColumn':
      return (
        <div className="space-y-3 pt-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Left title" value={block.leftTitle} onChange={(v) => onChange({ leftTitle: v } as Partial<PageBlock>)} />
            <Input label="Right title" value={block.rightTitle} onChange={(v) => onChange({ rightTitle: v } as Partial<PageBlock>)} />
            <Textarea label="Left body" value={block.leftBody} onChange={(v) => onChange({ leftBody: v } as Partial<PageBlock>)} />
            <Textarea label="Right body" value={block.rightBody} onChange={(v) => onChange({ rightBody: v } as Partial<PageBlock>)} />
          </div>
          <Select label="Image position" value={block.imagePosition} onChange={(v) => onChange({ imagePosition: v } as Partial<PageBlock>)} options={['none', 'left', 'right']} />
          {block.imagePosition !== 'none' && (
            <Input label="Image URL" value={block.imageUrl} onChange={(v) => onChange({ imageUrl: v } as Partial<PageBlock>)} />
          )}
        </div>
      );

    case 'featureGrid':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Section title" value={block.title} onChange={(v) => onChange({ title: v } as Partial<PageBlock>)} />
          <ArrayEditor
            items={block.items}
            onChange={(items) => onChange({ items } as Partial<PageBlock>)}
            template={{ icon: '', title: '', body: '' }}
            fields={[
              { key: 'icon', label: 'Icon/emoji', placeholder: '✨' },
              { key: 'title', label: 'Title' },
              { key: 'body', label: 'Body', textarea: true },
            ]}
          />
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Section title" value={block.title} onChange={(v) => onChange({ title: v } as Partial<PageBlock>)} />
          <ArrayEditor
            items={block.items}
            onChange={(items) => onChange({ items } as Partial<PageBlock>)}
            template={{ question: '', answer: '' }}
            fields={[
              { key: 'question', label: 'Question' },
              { key: 'answer', label: 'Answer', textarea: true },
            ]}
          />
        </div>
      );

    case 'cta':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Title" value={block.title} onChange={(v) => onChange({ title: v } as Partial<PageBlock>)} />
          <Textarea label="Body" value={block.body} onChange={(v) => onChange({ body: v } as Partial<PageBlock>)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Button label" value={block.ctaLabel} onChange={(v) => onChange({ ctaLabel: v } as Partial<PageBlock>)} />
            <Input label="Button link" value={block.ctaHref} onChange={(v) => onChange({ ctaHref: v } as Partial<PageBlock>)} />
          </div>
          <Select label="Style" value={block.variant} onChange={(v) => onChange({ variant: v } as Partial<PageBlock>)} options={['dark', 'light', 'accent']} />
        </div>
      );

    case 'productsRow':
      return (
        <div className="space-y-3 pt-3">
          <Input label="Title" value={block.title} onChange={(v) => onChange({ title: v } as Partial<PageBlock>)} />
          <Input label="Collection slug" value={block.collectionSlug} onChange={(v) => onChange({ collectionSlug: v } as Partial<PageBlock>)} />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider block mb-1">Limit</span>
            <input
              type="number"
              min={1}
              max={24}
              value={block.limit}
              onChange={(e) => onChange({ limit: parseInt(e.target.value) || 4 } as Partial<PageBlock>)}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
        </div>
      );

    case 'spacer':
      return (
        <div className="pt-3">
          <Select label="Size" value={block.size} onChange={(v) => onChange({ size: v } as Partial<PageBlock>)} options={['sm', 'md', 'lg', 'xl']} />
        </div>
      );

    default:
      return null;
  }
}

function ArrayEditor<T extends Record<string, string>>({
  items,
  onChange,
  template,
  fields,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  template: T;
  fields: { key: keyof T & string; label: string; placeholder?: string; textarea?: boolean }[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="border border-[var(--aw-border)] p-3 space-y-2 bg-[var(--aw-cream)]">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold">Item {idx + 1}</span>
            <button
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="text-xs text-red-700"
            >
              Remove
            </button>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <span className="text-[10px] font-semibold uppercase tracking-wider block mb-1">{f.label}</span>
              {f.textarea ? (
                <textarea
                  value={item[f.key]}
                  onChange={(e) => onChange(items.map((it, i) => (i === idx ? { ...it, [f.key]: e.target.value } : it)))}
                  rows={2}
                  className="w-full border border-[var(--aw-border-strong)] px-2 py-1 text-sm bg-white"
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  value={item[f.key]}
                  onChange={(e) => onChange(items.map((it, i) => (i === idx ? { ...it, [f.key]: e.target.value } : it)))}
                  className="w-full border border-[var(--aw-border-strong)] px-2 py-1 text-sm bg-white"
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { ...template }])}
        className="px-3 py-1.5 text-xs border border-[var(--aw-border-strong)] hover:bg-[var(--aw-cream)]"
      >
        + Add item
      </button>
    </div>
  );
}
