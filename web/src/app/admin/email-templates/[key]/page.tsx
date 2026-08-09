'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Template {
  key: string;
  name: string;
  description: string;
  variables: string[];
  subject: string;
  html: string;
  enabled: boolean;
  customized: boolean;
  builtinSubject: string;
  builtinHtml: string;
}

export default function EmailTemplateEditor({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/email-templates/${key}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.template) {
          setTpl(d.template);
          setSubject(d.template.subject);
          setHtml(d.template.html);
          setEnabled(d.template.enabled);
          // Seed example variable values for preview.
          const ex: Record<string, string> = {};
          d.template.variables.forEach((v: string) => {
            ex[v] = exampleFor(v);
          });
          setVars(ex);
        }
      })
      .finally(() => setLoading(false));
  }, [key]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMsg({ type: 'ok', text: 'Saved.' });
      if (tpl) setTpl({ ...tpl, customized: true });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    if (!confirm('Revert this template to the built-in default? Your customizations will be lost.')) return;
    const res = await fetch(`/api/admin/email-templates/${key}`, { method: 'DELETE' });
    if (res.ok && tpl) {
      setSubject(tpl.builtinSubject);
      setHtml(tpl.builtinHtml);
      setEnabled(true);
      setTpl({ ...tpl, customized: false });
      setMsg({ type: 'ok', text: 'Reverted to default.' });
    }
  }

  async function renderPreview() {
    const res = await fetch(`/api/admin/email-templates/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html, variables: vars }),
    });
    const data = await res.json();
    setPreview(data);
  }

  async function sendTest() {
    if (testing) return;
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${key}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testTo || undefined,
          subject,
          html,
          variables: vars,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test send failed');
      setMsg({
        type: 'ok',
        text: data.mocked
          ? `Email not configured — would have sent to ${data.sentTo}`
          : `Test email sent to ${data.sentTo}`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-[var(--aw-text-light)]">Loading…</div>;
  if (!tpl) return <div className="p-8 text-sm text-red-700">Template not found.</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <Link href="/admin/email-templates" className="text-xs text-[var(--aw-text-light)] underline">
            ← All templates
          </Link>
          <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
            {tpl.name}
          </h1>
          <p className="text-xs text-[var(--aw-text-light)] mt-1">{tpl.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          {tpl.customized && (
            <button
              onClick={revert}
              className="px-3 py-2 text-xs border border-red-300 text-red-700 hover:bg-red-50"
            >
              Revert to default
            </button>
          )}
          <div className="flex items-stretch border border-[var(--aw-border-strong)] rounded overflow-hidden">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@awulak.com"
              className="px-3 py-2 text-xs w-[180px] border-0 outline-none"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              title="Send a test copy of this template (subject is tagged [TEST])"
              className="px-3 py-2 text-xs bg-[#FBF7EE] hover:bg-[#F4ECDC] border-l border-[var(--aw-border-strong)] disabled:opacity-60"
            >
              {testing ? 'Sending…' : 'Send test'}
            </button>
          </div>
          <button
            onClick={renderPreview}
            className="px-4 py-2 text-sm border border-[var(--aw-border-strong)]"
          >
            Preview
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider block mb-1">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider block mb-1">
              HTML body
            </span>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={24}
              spellCheck={false}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-xs font-mono"
            />
          </label>

          <div className="bg-white border border-[var(--aw-border-strong)] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--aw-navy)]">
              Available variables
            </h3>
            <p className="text-xs text-[var(--aw-text-light)] mb-3">
              Insert anywhere in the subject or body using <code>{'{{name}}'}</code> syntax.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {tpl.variables.map((v) => (
                <label key={v} className="block">
                  <span className="text-[10px] font-mono text-[var(--aw-navy)]">{'{{'}{v}{'}}'}</span>
                  <input
                    value={vars[v] ?? ''}
                    onChange={(e) => setVars((s) => ({ ...s, [v]: e.target.value }))}
                    placeholder="example value"
                    className="w-full border border-[var(--aw-border-strong)] px-2 py-1 text-xs"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="sticky top-6 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-navy)]">
              Preview
            </h3>
            <div className="bg-white border border-[var(--aw-border-strong)] p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--aw-text-light)] mb-1">
                Subject
              </div>
              <div className="text-sm font-medium mb-4 border-b border-[var(--aw-border)] pb-3">
                {preview?.subject ?? subject}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--aw-text-light)] mb-2">
                Body
              </div>
              <iframe
                title="Email preview"
                srcDoc={preview?.html ?? html}
                className="w-full border border-[var(--aw-border)]"
                style={{ height: '60vh', background: '#FAF7F2' }}
              />
            </div>
            <p className="text-xs text-[var(--aw-text-light)]">
              Click <strong>Preview</strong> to substitute the example variables on the left.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function exampleFor(name: string): string {
  switch (name) {
    case 'siteName':
      return 'AWULA K';
    case 'name':
      return 'Ama';
    case 'resetUrl':
      return 'https://awulak.com/auth/reset-password?token=abc123';
    case 'orderId':
      return 'AW-1024';
    case 'productName':
      return 'Ankara Maxi Dress';
    case 'amount':
      return '285.00';
    case 'orderUrl':
      return 'https://awulak.com/orders';
    case 'designer':
      return 'Awula';
    case 'date':
      return 'Friday, May 15';
    case 'time':
      return '3:00 PM EST';
    case 'location':
      return 'Atlanta studio';
    case 'manageUrl':
      return 'https://awulak.com/consults';
    case 'carrier':
      return 'DHL';
    case 'trackingNumber':
      return '1Z999AA10123456784';
    case 'trackingUrl':
      return 'https://dhl.com/track';
    case 'shopUrl':
      return 'https://awulak.com';
    default:
      return '';
  }
}
