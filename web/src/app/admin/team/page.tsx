'use client';

import { useEffect, useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';

interface TeamUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
}

const INVITABLE_ROLES: Role[] = ROLES.filter((r) => r !== 'customer') as Role[];

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('admin');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/team');
    const d = await r.json();
    setUsers(d.users ?? []);
    setInvites(d.invites ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function invite() {
    setInviting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      setMsg({
        type: 'ok',
        text:
          data.mode === 'role_updated'
            ? 'Existing user updated.'
            : 'Invitation sent.',
      });
      setEmail('');
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(id: string, newRole: string) {
    const res = await fetch(`/api/admin/team/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((s) => s.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    } else {
      const d = await res.json();
      alert(d.error || 'Failed');
    }
  }

  async function revokeInvite(id: string) {
    if (!confirm('Revoke this invitation?')) return;
    const res = await fetch(`/api/admin/team/invite?id=${id}`, { method: 'DELETE' });
    if (res.ok) setInvites((s) => s.filter((i) => i.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
        Team
      </h1>

      {msg && (
        <div
          className={`p-3 text-sm mb-4 ${
            msg.type === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Invite form */}
      <section className="bg-white border border-[var(--aw-border-strong)] p-5 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-[var(--aw-navy)]">
          Invite a teammate
        </h2>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[220px]">
            <span className="text-xs block mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
              placeholder="name@example.com"
            />
          </label>
          <label>
            <span className="text-xs block mb-1">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={invite}
            disabled={inviting || !email}
            className="px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
          >
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        <p className="text-xs text-[var(--aw-text-light)] mt-2">
          Existing users will have their role updated immediately. New emails receive an
          invitation link valid for 7 days.
        </p>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-[var(--aw-navy)]">
            Pending invitations
          </h2>
          <div className="bg-white border border-[var(--aw-border-strong)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--aw-cream)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Expires</th>
                  <th className="text-left px-4 py-2">Invited by</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-[var(--aw-border)]">
                    <td className="px-4 py-2">{i.email}</td>
                    <td className="px-4 py-2">{ROLE_LABELS[i.role as Role] ?? i.role}</td>
                    <td className="px-4 py-2 text-xs">
                      {new Date(i.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-xs">{i.invitedBy ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => revokeInvite(i.id)}
                        className="text-xs text-red-700 underline"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Team members */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-[var(--aw-navy)]">
          Team members ({users.length})
        </h2>
        <div className="bg-white border border-[var(--aw-border-strong)] overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-[var(--aw-text-light)]">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-sm text-[var(--aw-text-light)]">No team members yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--aw-cream)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--aw-border)]">
                    <td className="px-4 py-2">{u.name ?? '—'}</td>
                    <td className="px-4 py-2 text-xs">{u.email}</td>
                    <td className="px-4 py-2">
                      <select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        className="border border-[var(--aw-border)] px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r as Role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
