'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';

interface ConversationSummary {
  id: string;
  unreadCount: number;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: string | null;
  createdAt: string;
}

interface NotificationPayload {
  unreadCount: number;
  notifications: NotificationItem[];
}

// Convert a notification type into the in-app URL the admin should jump to
// when they tap the row. Best-effort — falls back to the snapshot page so
// nothing ever feels like a dead-end click.
function notificationHref(n: NotificationItem): string {
  const id = n.relatedId;
  switch (n.type) {
    case 'consultation_rescheduled':
    case 'consultation_booked':
    case 'consultation_cancelled':
      return '/admin/services/consultations';
    case 'order_created':
    case 'order_paid':
    case 'order_status_changed':
      return id ? `/admin/orders/storefront/${id}` : '/admin/orders/storefront';
    case 'message_received':
      return '/admin/inbox';
    case 'review_submitted':
      return '/admin/reviews';
    case 'return_requested':
      return '/admin/returns';
    case 'designer_application_submitted':
      return '/admin/designer-applications';
    case 'low_stock':
      return id ? `/admin/products/${id}` : '/admin/inventory';
    default:
      return '/admin/snapshot';
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Compact header bar that runs across the top of every admin page.
// Surfaces the admin's identity, an unread-notifications bell, an unread-
// inbox bell, and a sign-out menu. Polls every 60s.
export default function AdminTopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  // Pull notification + inbox badge counts. Cheap call; runs every 60s.
  const loadBadges = useCallback(async () => {
    try {
      const [notifRes, convoRes] = await Promise.all([
        fetch('/api/notifications').catch(() => null),
        fetch('/api/admin/conversations').catch(() => null),
      ]);
      if (notifRes?.ok) {
        const data = (await notifRes.json().catch(() => null)) as NotificationPayload | null;
        if (data && typeof data.unreadCount === 'number') setUnreadNotifs(data.unreadCount);
        if (data && Array.isArray(data.notifications)) setNotifs(data.notifications);
      }
      if (convoRes?.ok) {
        const data = (await convoRes.json().catch(() => null)) as ConversationSummary[] | null;
        if (Array.isArray(data)) {
          const total = data.reduce((s, c) => s + (c.unreadCount || 0), 0);
          setUnreadMessages(total);
        }
      }
    } catch {
      // Silently keep prior values — top bar must never crash a page.
    }
  }, []);

  useEffect(() => {
    loadBadges();
    const id = setInterval(loadBadges, 60_000);
    return () => clearInterval(id);
  }, [loadBadges]);

  // Close menus on click-outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
    }
    if (menuOpen || notifOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen, notifOpen]);

  async function toggleNotifPanel() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      setNotifLoading(true);
      await loadBadges();
      setNotifLoading(false);
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    // Optimistic: clear the badge and flag every row read immediately so the
    // UI feels instant. If the request fails we re-pull and recover.
    setUnreadNotifs(0);
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllAsRead: true }),
      });
    } catch {
      // best-effort
    } finally {
      setMarkingAll(false);
    }
  }

  async function markOneRead(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadNotifs((c) => Math.max(0, c - 1));
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [id] }),
      });
    } catch {
      // best-effort
    }
  }

  async function openNotification(n: NotificationItem) {
    setNotifOpen(false);
    if (!n.isRead) await markOneRead(n.id);
    router.push(notificationHref(n));
  }

  const name = session?.user?.name || session?.user?.email || 'Admin';
  const initials = (() => {
    const base = (session?.user?.name || session?.user?.email || 'AK').trim();
    const parts = base.split(/[\s@.]+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'AK';
  })();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#F0EBE3] px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0" />

      <Link
        href="/admin/inbox"
        title="Inbox"
        className="relative p-2 rounded-lg text-[#1B2A5B] hover:bg-[#F0EBE3] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {unreadMessages > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[#C41E3A] text-white inline-flex items-center justify-center">
            {unreadMessages > 99 ? '99+' : unreadMessages}
          </span>
        )}
      </Link>

      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={toggleNotifPanel}
          title="Activity & alerts"
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
          className="relative p-2 rounded-lg text-[#1B2A5B] hover:bg-[#F0EBE3] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadNotifs > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[#D4A574] text-[#3a2d18] inline-flex items-center justify-center">
              {unreadNotifs > 99 ? '99+' : unreadNotifs}
            </span>
          )}
        </button>
        {notifOpen && (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-lg border border-[#F0EBE3] shadow-xl overflow-hidden z-40"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EBE3]">
              <div>
                <p className="text-sm font-semibold text-[#1B2A5B]">Notifications</p>
                <p className="text-[11px] text-[#8B7569]">
                  {unreadNotifs > 0 ? `${unreadNotifs} unread` : 'All caught up'}
                </p>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAll || unreadNotifs === 0}
                className="text-xs font-medium text-[#1B2A5B] hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {notifLoading ? (
                <p className="px-4 py-6 text-sm text-[#8B7569] text-center">Loading…</p>
              ) : notifs.length === 0 ? (
                <p className="px-4 py-8 text-sm text-[#8B7569] text-center">
                  No notifications yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#F4EFE6]">
                  {notifs.slice(0, 10).map((n) => (
                    <li key={n.id} className={n.isRead ? 'bg-white' : 'bg-[#FBF7EE]'}>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className="w-full text-left px-4 py-3 hover:bg-[#FAF2E2] transition-colors flex gap-3"
                      >
                        <span
                          aria-hidden
                          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-[#C41E3A]'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate ${n.isRead ? 'text-[#374151] font-medium' : 'text-[#1B2A5B] font-semibold'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-[#5A4A40] line-clamp-2 mt-0.5">{n.message}</p>
                          <p className="text-[11px] text-[#8B7569] mt-1">{relativeTime(n.createdAt)}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-2 border-t border-[#F0EBE3] bg-[#FBF8F2]">
              <Link
                href="/admin/snapshot"
                onClick={() => setNotifOpen(false)}
                className="block text-center text-xs font-medium text-[#1B2A5B] hover:underline py-1"
              >
                View activity snapshot →
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-[#F0EBE3] transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-[#1B2A5B] text-white text-xs font-bold inline-flex items-center justify-center">
            {initials}
          </div>
          <svg className="w-3.5 h-3.5 text-[#8B7569]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg border border-[#F0EBE3] shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F0EBE3]">
              <p className="text-sm font-semibold text-[#1B2A5B] truncate">{name}</p>
              {session?.user?.email && name !== session.user.email && (
                <p className="text-xs text-[#8B7569] truncate">{session.user.email}</p>
              )}
            </div>
            <Link
              href="/admin/settings"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2 text-sm text-[#1B2A5B] hover:bg-[#FAF7F2]"
            >
              Settings
            </Link>
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2 text-sm text-[#1B2A5B] hover:bg-[#FAF7F2]"
            >
              View storefront
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="block w-full text-left px-4 py-2 text-sm text-[#C41E3A] hover:bg-[#FAF7F2] border-t border-[#F0EBE3]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
