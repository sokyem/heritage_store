'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminErrorBanner, AdminEmptyState } from '@/components/admin/AdminErrorBanner';

interface ConversationRow {
  id: string;
  kind?: 'conversation' | 'order';
  title: string;
  relatedType: string | null;
  relatedId: string | null;
  customerName: string;
  customerEmail: string | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    authorRole: string | null;
    authorName: string | null;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  } | null;
}

interface ThreadResponse {
  conversation: {
    id: string;
    title: string;
    relatedType: string | null;
    relatedId: string | null;
    participants: Array<{ id: string; name: string | null; email: string | null; role: string | null }>;
  };
  messages: ThreadMessage[];
}

// Both conversation threads and order threads render into this shape so the
// inbox can show (and reply to) either one inline.
interface NormalizedMsg {
  id: string;
  content: string;
  createdAt: string;
  fromStaff: boolean;
  authorName: string;
}

function isStaffRole(role: string | null | undefined): boolean {
  return role === 'founder' || role === 'staff' || role === 'admin';
}

function isOrderThread(id: string | null): id is string {
  return !!id && id.startsWith('order:');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminInboxPage() {
  const [list, setList] = useState<ConversationRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadMsgs, setThreadMsgs] = useState<NormalizedMsg[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // New-conversation compose
  const [composing, setComposing] = useState(false);
  const [composeForm, setComposeForm] = useState({ customerEmail: '', customerName: '', title: '', message: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/admin/conversations');
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Failed to load inbox (${res.status})`);
      }
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load inbox');
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true);
    setThreadError(null);
    try {
      if (isOrderThread(id)) {
        // Order thread (OrderMessage) — read it inline instead of leaving the inbox.
        const orderId = id.slice('order:'.length);
        const res = await fetch(`/api/admin/orders/storefront/${orderId}/send-message`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Failed to load thread (${res.status})`);
        }
        const data = (await res.json()) as { messages: Array<{ id: string; direction: string; content: string; sentBy: string | null; createdAt: string }> };
        setThreadMsgs((data.messages || []).map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
          fromStaff: m.direction !== 'inbound',
          authorName: m.direction === 'inbound' ? 'Customer' : (m.sentBy || 'You'),
        })));
      } else {
        const res = await fetch(`/api/admin/conversations/${id}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Failed to load thread (${res.status})`);
        }
        const data = (await res.json()) as ThreadResponse;
        setThreadMsgs(data.messages.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
          fromStaff: isStaffRole(m.user?.role),
          authorName: m.user?.name || m.user?.email || 'Unknown',
        })));
        // Mark inbound messages as read so unread counts go down immediately.
        fetch(`/api/conversations/${id}/messages`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAllAsRead: true }),
        }).catch(() => null);
      }
    } catch (err) {
      setThreadMsgs([]);
      setThreadError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      // Order threads send via the order email flow; conversations via the
      // conversation reply. Both also deliver the per-thread Reply-To email.
      const res = isOrderThread(selectedId)
        ? await fetch(`/api/admin/orders/storefront/${selectedId.slice('order:'.length)}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: reply.trim() }),
          })
        : await fetch(`/api/admin/conversations/${selectedId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: reply.trim() }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Failed to send (${res.status})`);
      }
      setReply('');
      await Promise.all([loadThread(selectedId), loadList()]);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  }

  async function startConversation() {
    if (!composeForm.customerEmail.trim() || !composeForm.message.trim()) {
      setComposeError('Customer email and a message are required.');
      return;
    }
    setComposeSending(true);
    setComposeError(null);
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(composeForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Failed to start conversation (${res.status})`);
      setComposing(false);
      setComposeForm({ customerEmail: '', customerName: '', title: '', message: '' });
      await loadList();
      if (data?.id) setSelectedId(data.id);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setComposeSending(false);
    }
  }

  const selectedRow = useMemo(
    () => list.find((c) => c.id === selectedId) || null,
    [list, selectedId],
  );

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1
            className="text-xl sm:text-2xl font-semibold mb-1 text-[color:var(--aw-text-strong)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Inbox
          </h1>
          <p className="text-sm sm:text-base text-[color:var(--aw-text-muted)]">
            Customer messages and threads.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setComposing(true); setComposeError(null); }}
          className="btn-primary text-sm py-2 px-4 shrink-0"
        >
          ✉ New message
        </button>
      </div>

      <AdminErrorBanner message={listError} onRetry={loadList} />

      <div className="grid lg:grid-cols-[360px_1fr] gap-4 sm:gap-6">
        {/* ─── Conversation list ─────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">
              {listLoading ? 'Loading…' : `${list.length} conversation${list.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {!listLoading && list.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-[color:var(--aw-text-muted)]">No conversations yet.</p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {list.map((c) => {
                const isSelected = c.id === selectedId;
                const preview = c.lastMessage?.content || '(no messages yet)';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors ${
                      isSelected ? 'bg-[color:var(--aw-cream)]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-[color:var(--aw-text-strong)] truncate flex-1">
                        {c.customerName}
                      </p>
                      <span className="text-xs text-[color:var(--aw-text-muted)] shrink-0">
                        {timeAgo(c.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[color:var(--aw-text-muted)] truncate mb-1">
                      {c.id.startsWith('order:') && <span className="text-[10px] font-semibold text-[color:var(--aw-navy)] mr-1">🧾 ORDER</span>}
                      {c.title}
                    </p>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-[#5C3D2E] truncate flex-1 leading-snug">
                        {preview}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 text-[10px] font-bold px-1.5 rounded-full bg-[color:var(--aw-danger)] text-white shrink-0">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Thread + reply ────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm overflow-hidden flex flex-col min-h-[60vh]">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center p-10">
              <AdminEmptyState
                icon="💬"
                title="Select a conversation"
                hint="Pick a thread on the left to read and reply."
              />
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
                <p className="text-sm font-semibold text-[color:var(--aw-text-strong)]">
                  {selectedRow?.customerName || 'Customer'}
                </p>
                {selectedRow?.customerEmail && (
                  <p className="text-xs text-[color:var(--aw-text-muted)]">{selectedRow.customerEmail}</p>
                )}
              </div>

              <AdminErrorBanner
                message={threadError}
                onRetry={() => selectedId && loadThread(selectedId)}
              />

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[60vh]">
                {threadLoading ? (
                  <p className="text-sm text-[color:var(--aw-text-muted)] text-center py-8">Loading thread…</p>
                ) : threadMsgs.length === 0 ? (
                  <p className="text-sm text-[color:var(--aw-text-muted)] text-center py-8">No messages in this thread yet.</p>
                ) : (
                  threadMsgs.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.fromStaff ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-lg px-3 py-2 ${
                          m.fromStaff
                            ? 'bg-[color:var(--aw-navy)] text-white'
                            : 'bg-[color:var(--aw-cream)] text-[#2D2D2D]'
                        }`}
                      >
                        <p className="text-xs opacity-70 mb-1">
                          {m.authorName} · {timeAgo(m.createdAt)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-[color:var(--aw-border)] p-4">
                <AdminErrorBanner message={sendError} />
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    className="flex-1 input-field text-sm resize-none"
                    placeholder="Reply to customer…"
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                <p className="text-[11px] text-[color:var(--aw-text-muted)] mt-1.5">
                  Press ⌘/Ctrl + Enter to send.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── New conversation modal ─────────────────────────────── */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !composeSending && setComposing(false)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[color:var(--aw-border)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[color:var(--aw-text-strong)]">New message to a customer</h2>
              <button type="button" onClick={() => setComposing(false)} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <AdminErrorBanner message={composeError} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Customer email *</label>
                  <input
                    type="email"
                    value={composeForm.customerEmail}
                    onChange={(e) => setComposeForm((f) => ({ ...f, customerEmail: e.target.value }))}
                    className="input-field text-sm py-2 w-full"
                    placeholder="customer@email.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Customer name</label>
                  <input
                    value={composeForm.customerName}
                    onChange={(e) => setComposeForm((f) => ({ ...f, customerName: e.target.value }))}
                    className="input-field text-sm py-2 w-full"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Subject</label>
                <input
                  value={composeForm.title}
                  onChange={(e) => setComposeForm((f) => ({ ...f, title: e.target.value }))}
                  className="input-field text-sm py-2 w-full"
                  placeholder="e.g. About your order Z07WPLXW"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Message *</label>
                <textarea
                  value={composeForm.message}
                  onChange={(e) => setComposeForm((f) => ({ ...f, message: e.target.value }))}
                  rows={5}
                  className="input-field text-sm py-2 w-full resize-y"
                  placeholder="Write your message — the customer can reply by email and it lands back in this thread."
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[color:var(--aw-border)] flex justify-end gap-2">
              <button type="button" onClick={() => setComposing(false)} disabled={composeSending} className="btn-outline text-sm py-2 px-4">Cancel</button>
              <button type="button" onClick={startConversation} disabled={composeSending} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">
                {composeSending ? 'Sending…' : 'Send & start thread'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
