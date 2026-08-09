// ═══════════════════════════════════════════════════════════════════
// USPS Subscriptions-Tracking — webhook subscription keepalive
// ═══════════════════════════════════════════════════════════════════
//
// USPS deletes a tracking subscription after ~25 days with no delivered events.
// Because we ship through EasyPost (not our own MID), our subscription on
// /api/shipping/webhook/usps is fed nothing and gets pruned. Re-creating it
// resets that inactivity clock (USPS fires a verification handshake at the
// callback URL, which our route answers via the `body.challenge` branch).
//
// `renewTrackingSubscription()` lists the current subscription(s) for our MID,
// creates a fresh one, then deletes the stale one(s) — create-before-delete so
// we never drop to zero. Called weekly by /api/cron/usps-subscription-renew.
//
// API shape confirmed live against apis.usps.com (2026-06-13); see the
// standalone CLI at web/scripts/usps-subscription.mjs for the discovery notes.
// ═══════════════════════════════════════════════════════════════════

import { fetchUSPSToken } from '@/lib/usps';

const BASE_URL = (process.env.USPS_BASE_URL || 'https://apis.usps.com').replace(/\/$/, '');
const MID = process.env.USPS_MID || process.env.USPS_MAILER_ID || '';
const CALLBACK_URL =
  process.env.USPS_WEBHOOK_URL || 'https://www.awulak.com/api/shipping/webhook/usps';
const ALERT_EMAIL = process.env.USPS_ALERT_EMAIL || 'okyemsamuel@gmail.com';
const SUBS_PATH = '/subscriptions-tracking/v3/subscriptions';

export interface RenewResult {
  ok: boolean;
  mid: string;
  callbackUrl: string;
  createdId: string | null;
  deletedIds: string[];
  message: string;
}

async function getToken(): Promise<string> {
  // Prefer the explicit subscription scope; fall back to the default grant.
  const data = (await fetchUSPSToken('subscriptions-tracking')) || (await fetchUSPSToken());
  if (!data?.access_token) throw new Error('USPS OAuth failed — could not mint a token');
  return data.access_token;
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; ok: boolean; text: string; json: unknown; etag: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(extraHeaders || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, text, json, etag: res.headers.get('etag') || '' };
}

// DELETE requires an If-Match ETag (USPS optimistic concurrency, same as the
// pickup API). Read the resource's current ETag, delete, refresh + retry on 412.
async function deleteWithEtag(path: string, id: string, token: string) {
  const got = await api('GET', `${path}/${encodeURIComponent(id)}`, token);
  let del = await api('DELETE', `${path}/${encodeURIComponent(id)}`, token, undefined,
    got.etag ? { 'If-Match': got.etag } : undefined);
  if (del.status === 412) {
    const fresh = await api('GET', `${path}/${encodeURIComponent(id)}`, token);
    del = await api('DELETE', `${path}/${encodeURIComponent(id)}`, token, undefined,
      fresh.etag ? { 'If-Match': fresh.etag } : undefined);
  }
  return del;
}

/**
 * Re-create the USPS tracking subscription for our callback URL so its 25-day
 * inactivity clock resets. Idempotent: safe to call on any schedule.
 */
export async function renewTrackingSubscription(): Promise<RenewResult> {
  if (!MID) throw new Error('USPS_MID is not set — cannot manage a MID-based subscription');
  const secret = process.env.USPS_WEBHOOK_SECRET || '';
  if (secret.length < 32) {
    throw new Error(
      'USPS_WEBHOOK_SECRET must be set and >=32 chars — it has to match the registered ' +
      'subscription secret so the USPS handshake + events verify at the webhook route',
    );
  }

  const token = await getToken();

  // USPS rejects a create whose (URL + MID) duplicates a live subscription, and
  // its list endpoint (GET ?MID=) is heavily cached — it keeps returning deleted
  // ids and misses fresh ones — so we CANNOT rely on the list to find what to
  // delete. Instead: try to create; on a duplicate error USPS names the real
  // conflicting subscriptionId in the message, so we delete exactly that (with
  // its ETag) and retry. This is immune to list staleness and self-heals any
  // number of stragglers. The fresh creation timestamp resets the 25-day clock.
  const body = {
    listenerURL: CALLBACK_URL,
    secret,
    filterProperties: { MID },
    adminNotification: [{ email: ALERT_EMAIL }], // → alertEmailRecipients
  };

  const deletedIds: string[] = [];
  let created = await api('POST', SUBS_PATH, token, body);
  for (let attempt = 0; !created.ok && attempt < 5; attempt++) {
    const dupId = created.status === 400
      ? created.text.match(/subscriptionId\s*:\s*([0-9a-fA-F-]{36})/)?.[1]
      : undefined;
    if (!dupId || deletedIds.includes(dupId)) break; // not a resolvable duplicate
    const del = await deleteWithEtag(SUBS_PATH, dupId, token);
    if (!del.ok && del.status !== 404) {
      throw new Error(`Failed to delete conflicting subscription ${dupId}: ${del.status} — ${del.text.slice(0, 200)}`);
    }
    deletedIds.push(dupId);
    created = await api('POST', SUBS_PATH, token, body);
  }

  if (!created.ok) {
    // Redact the secret USPS echoes back in error payloads.
    const safe = created.text.replace(/("secret"\s*:\s*")[^"]*(")/g, '$1***$2').slice(0, 400);
    throw new Error(`USPS subscription create failed: ${created.status} — ${safe}`);
  }
  const c = created.json as Record<string, unknown> | null;
  const createdId =
    (c?.subscriptionId as string) || (c?.subscriptionID as string) ||
    (c?.id as string) || (c?.subscriptionKey as string) || null;

  return {
    ok: true,
    mid: MID,
    callbackUrl: CALLBACK_URL,
    createdId,
    deletedIds,
    message: `Created subscription ${createdId ?? '(id unknown)'}; replaced ${deletedIds.length} prior. 25-day clock reset.`,
  };
}
