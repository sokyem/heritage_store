'use client';

import { useEffect, useState, useCallback } from 'react';

const STAGES = ['Order Received', 'Measurements Confirmed', 'Fabric Purchased', 'Cutting', 'Sewing', 'Fitting', 'Finishing', 'Delivery'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const PRIORITY_COLORS: Record<string, string> = { LOW: '#8B7569', MEDIUM: '#D4A574', HIGH: '#C41E3A' };

interface Production {
  id: string;
  orderId: string;
  order: { orderId: string; item: string; client: { name: string } | null } | null;
  priority: string;
  stage: string;
  progress: number;
  dueDate: string | null;
}

export default function ProductionPage() {
  const [items, setItems] = useState<Production[]>([]);
  const [orders, setOrders] = useState<{ id: string; orderId: string; item: string; client: { name: string } | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/production').then((r) => r.json()),
      fetch('/api/admin/orders').then((r) => r.json()),
    ]).then(([p, o]) => {
      setItems(p);
      setOrders(o);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    await fetch('/api/admin/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    load();
  }

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1">Production</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">{items.length} items in production</p>
        </div>
        <button
          className="btn-primary text-base px-6 py-2.5"
          onClick={() => setEditing({ orderId: '', priority: 'MEDIUM', stage: 'Order Received', progress: 0, dueDate: '' })}
        >
          + Track Order
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg p-10 text-center text-base text-[color:var(--aw-text-muted)] shadow-sm border border-[color:var(--aw-border)]">No items in production yet</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg p-6 shadow-sm border border-[color:var(--aw-border)]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg font-semibold text-[color:var(--aw-text-strong)]">{item.order?.orderId || item.orderId}</span>
                    <span
                      className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded text-white"
                      style={{ background: PRIORITY_COLORS[item.priority] || '#8B7569' }}
                    >
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-[15px] text-[color:var(--aw-text-muted)]">
                    {item.order?.client?.name} — {item.order?.item}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[color:var(--aw-text-muted)]">{item.dueDate || 'No deadline'}</p>
                  <button
                    className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors mt-1"
                    onClick={() => setEditing({
                      orderId: item.orderId,
                      priority: item.priority,
                      stage: item.stage,
                      progress: item.progress,
                      dueDate: item.dueDate || '',
                    })}
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Stage indicators */}
              <div className="flex gap-1.5 mb-3">
                {STAGES.map((stage, i) => {
                  const currentIdx = STAGES.indexOf(item.stage);
                  return (
                    <div
                      key={stage}
                      className="flex-1 h-2 rounded-full"
                      style={{ background: i <= currentIdx ? '#1B2A5B' : '#F0EBE3' }}
                      title={stage}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[color:var(--aw-text-strong)] font-semibold">{item.stage}</span>
                <span className="text-sm text-[color:var(--aw-text-muted)]">{item.progress}% complete</span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-2 bg-[color:var(--aw-cream)] rounded-full overflow-hidden">
                <div className="h-full bg-[color:var(--aw-navy)] rounded-full transition-all" style={{ width: `${item.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5">Production Tracker</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Order</label>
                <select
                  className="input-field text-base py-2.5"
                  value={(editing.orderId as string) || ''}
                  onChange={(e) => setEditing({ ...editing, orderId: e.target.value })}
                >
                  <option value="">Select order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.orderId}>{o.orderId} — {o.client?.name} — {o.item}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Priority</label>
                  <select className="input-field text-base py-2.5" value={(editing.priority as string) || 'MEDIUM'} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Stage</label>
                  <select className="input-field text-base py-2.5" value={(editing.stage as string) || 'Order Received'} onChange={(e) => setEditing({ ...editing, stage: e.target.value })}>
                    {STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Progress ({editing.progress as number}%)</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="w-full accent-[#1B2A5B]"
                  value={(editing.progress as number) || 0}
                  onChange={(e) => setEditing({ ...editing, progress: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Due Date</label>
                <input className="input-field text-base py-2.5" value={(editing.dueDate as string) || ''} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} placeholder="e.g. 2025-06-15" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !editing.orderId}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
