'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

/* ══════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════ */

interface Client {
  id: string;
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Designer {
  id: string;
  name: string;
}

interface CustomOrder {
  id: string;
  orderId: string;
  clientId: string;
  client: { name: string; clientId: string } | null;
  status: string;
  eventType: string;
  eventDate: string | null;
  deadline: string | null;
  description: string;
  inspirationNotes: string | null;
  colorPrefs: string | null;
  fabricPrefs: string | null;
  estimatedPrice: number | null;
  depositAmount: number | null;
  depositPaid: boolean;
  designerId: string | null;
  designerName: string | null;
  priority: string;
  source: string;
  notes: string | null;
  createdAt: string;
}

/* ══════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════ */

const PIPELINE_STAGES = [
  { key: 'Inquiry Received', label: 'Inquiry Received', color: '#6B7280' },
  { key: 'pending_assignment', label: 'Pending Assignment', color: '#D97706' },
  { key: 'offered', label: 'Offer Sent', color: '#2563EB' },
  { key: 'assigned', label: 'Assigned', color: '#7C3AED' },
  { key: 'Consultation Scheduled', label: 'Consultation Scheduled', color: '#3B82F6' },
  { key: 'Measurements Received', label: 'Measurements Received', color: '#6366F1' },
  { key: 'Quote Sent', label: 'Quote Sent', color: '#F59E0B' },
  { key: 'Deposit Paid', label: 'Deposit Paid', color: '#22C55E' },
  { key: 'In Production', label: 'In Production', color: '#C41E3A' },
  { key: 'Fitting Scheduled', label: 'Fitting Scheduled', color: '#8B5CF6' },
  { key: 'Ready for Delivery', label: 'Ready for Delivery', color: '#059669' },
] as const;

const EVENT_TYPES = ['Wedding', 'Engagement', 'Anniversary', 'Birthday', 'Funeral', 'Naming Ceremony', 'Graduation', 'Corporate', 'Festival', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const SOURCES = ['Website', 'Instagram', 'Referral', 'Walk-in', 'Phone', 'Other'];

const PRIORITY_COLORS: Record<string, string> = {
  Low: '#6B7280',
  Medium: '#3B82F6',
  High: '#F59E0B',
  Urgent: '#C41E3A',
};

const EMPTY_FORM = {
  clientId: '',
  eventType: 'Wedding',
  eventDate: '',
  deadline: '',
  description: '',
  inspirationNotes: '',
  colorPrefs: '',
  fabricPrefs: '',
  estimatedPrice: '',
  depositAmount: '',
  designerId: '',
  priority: 'Medium',
  source: 'Website',
  notes: '',
};

/* ══════════════════════════════════════════════════════════
   Helper: days until a date
   ══════════════════════════════════════════════════════════ */

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColor(days: number | null): string {
  if (days === null) return '#8B7569';
  if (days < 0) return '#C41E3A';
  if (days < 7) return '#C41E3A';
  if (days < 14) return '#F59E0B';
  return '#8B7569';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/* ══════════════════════════════════════════════════════════
   OrderCard — used in pipeline view
   ══════════════════════════════════════════════════════════ */

function OrderCard({ order, onClick }: { order: CustomOrder; onClick: () => void }) {
  const days = daysUntil(order.deadline);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg p-4 shadow-sm border border-[color:var(--aw-border)] hover:shadow-md hover:border-[#D4A574]/40 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[color:var(--aw-text-strong)] truncate">{order.client?.name || 'Unknown Client'}</p>
          <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">{order.orderId}</p>
        </div>
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
          title={order.priority}
          style={{ background: PRIORITY_COLORS[order.priority] || '#6B7280' }}
        />
      </div>

      {order.eventType && (
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-[color:var(--aw-text-strong)] bg-[color:var(--aw-cream)] px-2 py-0.5 rounded mb-2">
          {order.eventType}
        </span>
      )}

      {order.deadline && (
        <div className="flex items-center gap-1.5 mb-2">
          <svg className="w-3.5 h-3.5 shrink-0" style={{ color: deadlineColor(days) }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-medium" style={{ color: deadlineColor(days) }}>
            {formatDate(order.deadline)}
            {days !== null && (
              <span className="ml-1">
                ({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`})
              </span>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[color:var(--aw-border)]">
        {order.designerName ? (
          <span className="text-xs text-[color:var(--aw-text-muted)] truncate max-w-[60%]">{order.designerName}</span>
        ) : (
          <span className="text-xs text-[#D4A574] italic">Unassigned</span>
        )}
        {order.estimatedPrice != null && (
          <span className="text-xs font-semibold text-[color:var(--aw-text-strong)]">${order.estimatedPrice.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DetailDrawer — shows full order when clicking a card
   ══════════════════════════════════════════════════════════ */

function DetailDrawer({ order, designers, onClose }: { order: CustomOrder; designers: Designer[]; onClose: () => void }) {
  const days = daysUntil(order.deadline);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<any>(null);
  const [assignMode, setAssignMode] = useState<'manual' | 'auto'>('manual');
  const [selectedDesignerId, setSelectedDesignerId] = useState('');

  useEffect(() => {
    fetch(`/api/admin/custom-orders/${order.id}/assignment-status`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setAssignmentStatus(data); })
      .catch(() => {});

    if (order.status === 'offered' || order.status === 'pending_assignment') {
      const interval = setInterval(() => {
        fetch(`/api/admin/custom-orders/${order.id}/assignment-status`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) setAssignmentStatus(data); })
          .catch(() => {});
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [order.id, order.status]);

  const handleAutoAssign = async () => {
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await fetch(`/api/admin/custom-orders/${order.id}/assign`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setAssignResult({
          type: 'success',
          message: `Offer sent to ${data.offer?.designerName || 'designer'} (${data.candidateCount} candidates found)`,
        });
      } else {
        setAssignResult({ type: 'error', message: data.error || 'Assignment failed' });
      }
    } catch {
      setAssignResult({ type: 'error', message: 'Network error' });
    } finally {
      setAssigning(false);
    }
  };

  const handleManualAssign = async () => {
    if (!selectedDesignerId) return;
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await fetch(`/api/admin/custom-orders/${order.id}/assign-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designerId: selectedDesignerId }),
      });
      const data = await res.json();
      if (res.ok) {
        const designer = designers.find((d) => d.id === selectedDesignerId);
        setAssignResult({ type: 'success', message: `Assigned to ${designer?.name || 'designer'}` });
      } else {
        setAssignResult({ type: 'error', message: data.error || 'Assignment failed' });
      }
    } catch {
      setAssignResult({ type: 'error', message: 'Network error' });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-[color:var(--aw-border)] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]">{order.orderId}</h2>
            <p className="text-sm text-[color:var(--aw-text-muted)]">{order.client?.name || 'Unknown Client'}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/admin/quotes?new=1&clientId=${encodeURIComponent(order.clientId || '')}&item=${encodeURIComponent([order.eventType, order.description].filter(Boolean).join(' — ') || 'Custom design')}&total=${encodeURIComponent(String(order.estimatedPrice ?? 0))}&deposit=${encodeURIComponent(String(order.depositAmount ?? 0))}&notes=${encodeURIComponent(`From inquiry ${order.orderId}${order.eventDate ? ` (event ${order.eventDate})` : ''}`)}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#059669] border border-[#059669]/30 hover:bg-[#059669]/10 transition-colors"
              title="Create an invoice / quote prefilled from this inquiry"
            >
              + Invoice
            </a>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[color:var(--aw-cream)] text-[color:var(--aw-text-muted)] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-2">Status</p>
            <span
              className="inline-block text-xs font-semibold uppercase tracking-wide text-white px-3 py-1.5 rounded"
              style={{ background: PIPELINE_STAGES.find((s) => s.key === order.status)?.color || '#6B7280' }}
            >
              {order.status}
            </span>
          </div>

          {/* Priority & Source */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Priority</p>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRIORITY_COLORS[order.priority] || '#6B7280' }} />
                <span className="text-sm text-[#2D2D2D]">{order.priority}</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Source</p>
              <span className="text-sm text-[#2D2D2D]">{order.source || '—'}</span>
            </div>
          </div>

          {/* Event Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Event Type</p>
              <span className="text-sm text-[#2D2D2D]">{order.eventType || '—'}</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Event Date</p>
              <span className="text-sm text-[#2D2D2D]">{formatDate(order.eventDate)}</span>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Deadline</p>
            <span className="text-sm font-medium" style={{ color: deadlineColor(days) }}>
              {formatDate(order.deadline)}
              {days !== null && (
                <span className="ml-1">
                  ({days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Today' : `${days} days remaining`})
                </span>
              )}
            </span>
          </div>

          {/* Design Details */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-2">Design Details</p>
            <div className="bg-[color:var(--aw-surface-muted)] rounded-lg p-4 space-y-3">
              <div>
                <p className="text-xs text-[color:var(--aw-text-muted)] mb-0.5">Description</p>
                <p className="text-sm text-[#2D2D2D]">{order.description || '—'}</p>
              </div>
              {order.inspirationNotes && (
                <div>
                  <p className="text-xs text-[color:var(--aw-text-muted)] mb-0.5">Inspiration Notes</p>
                  <p className="text-sm text-[#2D2D2D]">{order.inspirationNotes}</p>
                </div>
              )}
              {order.colorPrefs && (
                <div>
                  <p className="text-xs text-[color:var(--aw-text-muted)] mb-0.5">Color Preferences</p>
                  <p className="text-sm text-[#2D2D2D]">{order.colorPrefs}</p>
                </div>
              )}
              {order.fabricPrefs && (
                <div>
                  <p className="text-xs text-[color:var(--aw-text-muted)] mb-0.5">Fabric Preferences</p>
                  <p className="text-sm text-[#2D2D2D]">{order.fabricPrefs}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Estimated Price</p>
              <span className="text-lg font-semibold text-[color:var(--aw-text-strong)]">
                {order.estimatedPrice != null ? `$${order.estimatedPrice.toLocaleString()}` : '—'}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Deposit</p>
              <span className="text-lg font-semibold" style={{ color: order.depositPaid ? '#2D8E5A' : '#C41E3A' }}>
                {order.depositAmount != null ? `$${order.depositAmount.toLocaleString()}` : '—'}
              </span>
              {order.depositAmount != null && (
                <span className={`ml-2 text-xs font-medium ${order.depositPaid ? 'text-[#2D8E5A]' : 'text-[color:var(--aw-danger)]'}`}>
                  {order.depositPaid ? 'Paid' : 'Pending'}
                </span>
              )}
            </div>
          </div>

          {/* Designer */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Assigned Designer</p>
            <span className="text-sm text-[#2D2D2D]">{order.designerName || 'Unassigned'}</span>
          </div>

          {/* Assignment Controls */}
          <div className="bg-[color:var(--aw-surface-muted)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)]">Designer Assignment</p>
              {/* Mode Toggle */}
              {!order.designerName && order.status !== 'assigned' && (
                <div className="flex items-center bg-white rounded-md p-0.5 border border-[color:var(--aw-border)]">
                  <button
                    onClick={() => setAssignMode('manual')}
                    className={`text-[10px] font-semibold px-3 py-1 rounded transition-colors ${
                      assignMode === 'manual' ? 'bg-[color:var(--aw-navy)] text-white' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => setAssignMode('auto')}
                    className={`text-[10px] font-semibold px-3 py-1 rounded transition-colors ${
                      assignMode === 'auto' ? 'bg-[color:var(--aw-navy)] text-white' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
                    }`}
                  >
                    Auto
                  </button>
                </div>
              )}
            </div>

            {assignResult && (
              <div className={`text-sm font-medium px-3 py-2 rounded-lg mb-3 ${
                assignResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {assignResult.message}
              </div>
            )}

            {/* Active Offer Status (auto mode) */}
            {assignmentStatus?.activeOffer && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-700 uppercase">Active Offer</span>
                  <span className="text-xs font-bold text-blue-600">
                    {assignmentStatus.activeOffer.secondsRemaining}s remaining
                  </span>
                </div>
                <p className="text-sm text-blue-800">
                  Offered to {assignmentStatus.activeOffer.designer.name} ({assignmentStatus.activeOffer.designer.designerId})
                </p>
              </div>
            )}

            {/* Offer History */}
            {assignmentStatus?.offerHistory?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-[color:var(--aw-text-muted)] mb-1">
                  Offer History ({assignmentStatus.offerHistory.length} total)
                </p>
                <div className="space-y-1">
                  {assignmentStatus.offerHistory.slice(-3).map((h: any) => (
                    <div key={h.offerId} className="flex items-center justify-between text-xs">
                      <span className="text-[#2D2D2D]">{h.designer.name}</span>
                      <span className={`font-medium ${
                        h.status === 'accepted' ? 'text-green-600' :
                        h.status === 'declined' ? 'text-red-500' :
                        'text-gray-400'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assignment Actions */}
            {!order.designerName && order.status !== 'offered' && order.status !== 'assigned' && (
              <>
                {assignMode === 'manual' ? (
                  <div className="space-y-2">
                    <select
                      value={selectedDesignerId}
                      onChange={(e) => setSelectedDesignerId(e.target.value)}
                      className="w-full text-sm border border-[#D1D5DB] rounded-lg px-3 py-2.5 bg-white text-[color:var(--aw-text-strong)] focus:border-[color:var(--aw-navy)] focus:ring-1 focus:ring-[#1B2A5B] transition-colors"
                    >
                      <option value="">Select a designer...</option>
                      {designers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleManualAssign}
                      disabled={assigning || !selectedDesignerId}
                      className="w-full text-sm font-semibold text-white py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: assigning || !selectedDesignerId ? '#9CA3AF' : '#1B2A5B' }}
                    >
                      {assigning ? 'Assigning...' : 'Assign Designer'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mb-2">
                      Sends a 60-second offer to the best-matching designer. If declined, the next designer is offered automatically.
                    </p>
                    <button
                      onClick={handleAutoAssign}
                      disabled={assigning}
                      className="w-full text-sm font-semibold text-white py-2.5 px-4 rounded-lg transition-colors"
                      style={{ background: assigning ? '#9CA3AF' : '#C41E3A', cursor: assigning ? 'not-allowed' : 'pointer' }}
                    >
                      {assigning ? 'Finding Designer...' : 'Auto-Assign Designer'}
                    </button>
                  </div>
                )}
              </>
            )}

            {order.status === 'assigned' && order.designerName && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Assigned to {order.designerName}
              </div>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-2">Notes</p>
              <p className="text-sm text-[#2D2D2D] whitespace-pre-wrap bg-[color:var(--aw-surface-muted)] rounded-lg p-4">{order.notes}</p>
            </div>
          )}

          {/* Created */}
          <div className="pt-4 border-t border-[color:var(--aw-border)]">
            <p className="text-xs text-[color:var(--aw-text-muted)]">Created: {formatDate(order.createdAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   NewOrderModal — large form modal
   ══════════════════════════════════════════════════════════ */

function NewOrderModal({
  clients,
  designers,
  onClose,
  onSave,
}: {
  clients: Client[];
  designers: Designer[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Inline "add a new client" so the admin doesn't have to leave the order form.
  const [localClients, setLocalClients] = useState<Client[]>(clients);
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });
  const [creatingClient, setCreatingClient] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function createClient() {
    if (!newClient.name.trim()) { setError('Client name is required'); return; }
    setCreatingClient(true);
    setError('');
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClient.name.trim(),
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('create failed');
      const created = await res.json();
      setLocalClients((prev) => [created as Client, ...prev]);
      setForm((prev) => ({ ...prev, clientId: created.clientId }));
      setNewClient({ name: '', email: '', phone: '' });
      setAddingClient(false);
    } catch {
      setError('Could not create the client. Please try again.');
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSubmit() {
    if (!form.clientId) { setError('Please select a client'); return; }
    if (!form.description.trim()) { setError('Please add a description'); return; }
    setError('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        estimatedPrice: form.estimatedPrice ? parseFloat(form.estimatedPrice) : null,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : null,
        designerId: form.designerId || null,
      });
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const labelCls = 'block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1';
  const inputCls = 'input-field text-base py-2.5';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl mx-4 max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-[color:var(--aw-border)] px-7 py-5 rounded-t-xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
                New Custom Order
              </h2>
              <p className="text-sm text-[color:var(--aw-text-muted)] mt-0.5">Fill in the details for the new order</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[color:var(--aw-cream)] text-[color:var(--aw-text-muted)] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-7 space-y-7">
          {error && (
            <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Section 1: Client Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)]">Client</h3>
              <button
                type="button"
                onClick={() => { setAddingClient((v) => !v); setError(''); }}
                className="text-xs font-semibold text-[#1B2A5B] hover:underline"
              >
                {addingClient ? '← Pick existing client' : '+ New client'}
              </button>
            </div>
            {addingClient ? (
              <div className="space-y-2 rounded-lg border border-[color:var(--aw-border)] p-3">
                <input className={inputCls} placeholder="Full name *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                  <input className={inputCls} placeholder="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                </div>
                <button
                  type="button"
                  onClick={createClient}
                  disabled={creatingClient || !newClient.name.trim()}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  {creatingClient ? 'Creating…' : 'Create & select client'}
                </button>
              </div>
            ) : (
              <select className={inputCls} value={form.clientId} onChange={(e) => update('clientId', e.target.value)}>
                <option value="">Select client...</option>
                {localClients.map((c) => (
                  <option key={c.id} value={c.clientId}>{c.name} ({c.clientId})</option>
                ))}
              </select>
            )}
          </div>

          {/* Section 2: Event Details */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Event Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Event Type</label>
                <select className={inputCls} value={form.eventType} onChange={(e) => update('eventType', e.target.value)}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Event Date</label>
                <input type="date" className={inputCls} value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Deadline</label>
                <input type="date" className={inputCls} value={form.deadline} onChange={(e) => update('deadline', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Section 3: Design Details */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Design Details</h3>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Description</label>
                <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the garment..." />
              </div>
              <div>
                <label className={labelCls}>Inspiration Notes</label>
                <textarea className={inputCls} rows={2} value={form.inspirationNotes} onChange={(e) => update('inspirationNotes', e.target.value)} placeholder="Reference images, styles, etc." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Color Preferences</label>
                  <input className={inputCls} value={form.colorPrefs} onChange={(e) => update('colorPrefs', e.target.value)} placeholder="e.g. Gold, emerald green" />
                </div>
                <div>
                  <label className={labelCls}>Fabric Preferences</label>
                  <input className={inputCls} value={form.fabricPrefs} onChange={(e) => update('fabricPrefs', e.target.value)} placeholder="e.g. Kente, silk" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Pricing */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Pricing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Estimated Price ($)</label>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.estimatedPrice} onChange={(e) => update('estimatedPrice', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Deposit Amount ($)</label>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.depositAmount} onChange={(e) => update('depositAmount', e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>

          {/* Section 5: Assignment */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Assignment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Designer</label>
                <select className={inputCls} value={form.designerId} onChange={(e) => update('designerId', e.target.value)}>
                  <option value="">Unassigned</option>
                  {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select className={inputCls} value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 6: Source */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Source</h3>
            <select className={inputCls} value={form.source} onChange={(e) => update('source', e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Section 7: Notes */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Notes</h3>
            <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="General notes about this order..." />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-[color:var(--aw-border)] px-7 py-4 flex justify-end gap-3 rounded-b-xl">
          <button className="btn-outline text-base px-6 py-2.5" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn-primary text-base px-6 py-2.5"
            onClick={handleSubmit}
            disabled={saving || !form.clientId || !form.description.trim()}
          >
            {saving ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page Component
   ══════════════════════════════════════════════════════════ */

export default function CustomOrdersPage() {
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'list'>('pipeline');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomOrder | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('deadline');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const oRes = await fetch('/api/admin/custom-orders');
      if (!oRes.ok) {
        const err = await oRes.json().catch(() => null);
        throw new Error(err?.error || `Custom orders failed to load (${oRes.status})`);
      }
      // Clients / designers are non-fatal — empty arrays let the page render.
      const [o, c, d] = await Promise.all([
        oRes.json(),
        fetch('/api/admin/clients').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch('/api/admin/designers').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setClients(Array.isArray(c) ? c : []);
      setDesigners(Array.isArray(d) ? d : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load custom orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = orders.length;
    const inProgress = orders.filter((o) =>
      !['Inquiry Received', 'Ready for Delivery'].includes(o.status)
    ).length;
    const needsAttention = orders.filter((o) => {
      const days = daysUntil(o.deadline);
      return days !== null && days < 7;
    }).length;
    const revenue = orders.reduce((sum, o) => sum + (o.estimatedPrice || 0), 0);
    return { total, inProgress, needsAttention, revenue };
  }, [orders]);

  /* ── Pipeline grouping ── */
  const pipeline = useMemo(() => {
    const map = new Map<string, CustomOrder[]>();
    PIPELINE_STAGES.forEach((s) => map.set(s.key, []));
    orders.forEach((o) => {
      const list = map.get(o.status);
      if (list) list.push(o);
      else {
        const fallback = map.get('Inquiry Received');
        if (fallback) fallback.push(o);
      }
    });
    return map;
  }, [orders]);

  /* ── List filtering & sorting ── */
  const filteredOrders = useMemo(() => {
    let result = orders.filter((o) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        o.orderId.toLowerCase().includes(q) ||
        (o.client?.name || '').toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.eventType || '').toLowerCase().includes(q);
      const matchStatus = !statusFilter || o.status === statusFilter;
      return matchSearch && matchStatus;
    });

    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortColumn) {
        case 'orderId': aVal = a.orderId; bVal = b.orderId; break;
        case 'client': aVal = a.client?.name || ''; bVal = b.client?.name || ''; break;
        case 'event': aVal = a.eventType || ''; bVal = b.eventType || ''; break;
        case 'deadline': aVal = a.deadline || '9999'; bVal = b.deadline || '9999'; break;
        case 'designer': aVal = a.designerName || ''; bVal = b.designerName || ''; break;
        case 'status': aVal = a.status; bVal = b.status; break;
        case 'price': aVal = a.estimatedPrice || 0; bVal = b.estimatedPrice || 0; break;
        case 'priority': {
          const order = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
          aVal = order[a.priority as keyof typeof order] ?? 2;
          bVal = order[b.priority as keyof typeof order] ?? 2;
          break;
        }
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, search, statusFilter, sortColumn, sortDir]);

  function handleSort(col: string) {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  }

  async function handleCreateOrder(data: Record<string, unknown>) {
    const res = await fetch('/api/admin/custom-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create order');
    setShowNewModal(false);
    load();
  }

  /* ── Sort indicator ── */
  function SortIcon({ col }: { col: string }) {
    if (sortColumn !== col) return null;
    return (
      <svg className="w-3 h-3 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
    );
  }

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="p-6 lg:p-10 max-w-[1600px]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Custom Orders
          </h1>
          <p className="text-base text-[color:var(--aw-text-muted)] mt-0.5">Pipeline view</p>
        </div>
        <button
          className="btn-primary text-base px-6 py-2.5 shrink-0"
          onClick={() => setShowNewModal(true)}
        >
          + New Custom Order
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, color: '#1B2A5B' },
          { label: 'In Progress', value: stats.inProgress, color: '#C41E3A' },
          { label: 'Needs Attention', value: stats.needsAttention, color: '#F59E0B' },
          { label: 'Revenue', value: `$${stats.revenue.toLocaleString()}`, color: '#2D8E5A' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg p-5 shadow-sm border border-[color:var(--aw-border)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{s.label}</p>
            <p className="text-2xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Toggle */}
      <div className="flex items-center gap-1 bg-[color:var(--aw-cream)] rounded-lg p-1 w-fit mb-6">
        {(['pipeline', 'list'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab
                ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm'
                : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
            }`}
          >
            {tab === 'pipeline' ? 'Pipeline View' : 'List View'}
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-5 py-4 rounded-lg mb-6 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="text-[color:var(--aw-danger)] underline text-sm font-semibold">Retry</button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="loading-spinner mx-auto" />
        </div>
      )}

      {/* Pipeline View */}
      {!loading && !error && activeTab === 'pipeline' && (
        <div className="overflow-x-auto pb-4 -mx-6 lg:-mx-10 px-6 lg:px-10">
          <div className="flex gap-4" style={{ minWidth: `${PIPELINE_STAGES.length * 280}px` }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageOrders = pipeline.get(stage.key) || [];
              return (
                <div key={stage.key} className="flex-1 min-w-[260px] max-w-[320px]">
                  {/* Column Header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#2D2D2D] truncate">
                      {stage.label}
                    </span>
                    <span
                      className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0"
                      style={{ background: stage.color }}
                    >
                      {stageOrders.length}
                    </span>
                  </div>

                  {/* Column Body */}
                  <div className="bg-[color:var(--aw-surface-muted)] rounded-xl p-2.5 min-h-[200px] space-y-2.5">
                    {stageOrders.length === 0 ? (
                      <div className="flex items-center justify-center h-[160px]">
                        <p className="text-xs text-[color:var(--aw-text-muted)]/50">No orders</p>
                      </div>
                    ) : (
                      stageOrders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          onClick={() => setSelectedOrder(order)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {!loading && !error && activeTab === 'list' && (
        <>
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              className="input-field max-w-sm text-base py-2.5"
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input-field max-w-[220px] text-base py-2.5"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                  {[
                    { key: 'orderId', label: 'Order ID' },
                    { key: 'client', label: 'Client' },
                    { key: 'event', label: 'Event' },
                    { key: 'deadline', label: 'Deadline' },
                    { key: 'designer', label: 'Designer' },
                    { key: 'status', label: 'Status' },
                    { key: 'price', label: 'Price' },
                    { key: 'priority', label: 'Priority' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-4 cursor-pointer hover:text-[color:var(--aw-text-strong)] transition-colors select-none"
                    >
                      {col.label}
                      <SortIcon col={col.key} />
                    </th>
                  ))}
                  <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-right px-4 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const days = daysUntil(o.deadline);
                  return (
                    <tr key={o.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-bg)] transition-colors">
                      <td className="px-4 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{o.orderId}</td>
                      <td className="px-4 py-4 text-[15px]">{o.client?.name || '—'}</td>
                      <td className="px-4 py-4">
                        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-[color:var(--aw-text-strong)] bg-[color:var(--aw-cream)] px-2 py-0.5 rounded">
                          {o.eventType || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium" style={{ color: deadlineColor(days) }}>
                          {formatDate(o.deadline)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[color:var(--aw-text-muted)]">{o.designerName || '—'}</td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-block text-xs font-semibold uppercase tracking-wide text-white px-2.5 py-1 rounded"
                          style={{ background: PIPELINE_STAGES.find((s) => s.key === o.status)?.color || '#6B7280' }}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[15px] font-medium text-[color:var(--aw-text-strong)]">
                        {o.estimatedPrice != null ? `$${o.estimatedPrice.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRIORITY_COLORS[o.priority] || '#6B7280' }} />
                          <span className="text-sm text-[#2D2D2D]">{o.priority}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors"
                          onClick={() => setSelectedOrder(o)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center">
                      <svg className="w-10 h-10 text-[#D4A574]/40 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <p className="text-base text-[color:var(--aw-text-muted)]">No custom orders found</p>
                      <p className="text-sm text-[color:var(--aw-text-muted)]/60 mt-1">Try adjusting your search or filters</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty State (when no orders at all, pipeline view) */}
      {!loading && !error && orders.length === 0 && activeTab === 'pipeline' && (
        <div className="text-center py-20">
          <svg className="w-16 h-16 text-[#D4A574]/30 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <h3 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            No custom orders yet
          </h3>
          <p className="text-base text-[color:var(--aw-text-muted)] mb-5">Create your first custom order to get started</p>
          <button className="btn-primary text-base px-6 py-2.5" onClick={() => setShowNewModal(true)}>
            + New Custom Order
          </button>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedOrder && (
        <DetailDrawer order={selectedOrder} designers={designers} onClose={() => setSelectedOrder(null)} />
      )}

      {/* New Order Modal */}
      {showNewModal && (
        <NewOrderModal
          clients={clients}
          designers={designers}
          onClose={() => setShowNewModal(false)}
          onSave={handleCreateOrder}
        />
      )}

      {/* Slide-in animation style */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
