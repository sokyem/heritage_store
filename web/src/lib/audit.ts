/**
 * Lightweight audit-log helper. Use from any admin API route after a
 * successful mutation. Failures are swallowed so a logging hiccup never
 * blocks the user's request.
 */

import { prisma } from '@/lib/prisma';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'other';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? null,
        diff: (entry.diff as any) ?? undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit logging must never break the request flow.
    console.error('[audit] failed to record entry', err);
  }
}
