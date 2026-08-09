// ═══════════════════════════════════════════════════════════════════
// USPS Subscriptions-Tracking — webhook subscription keepalive / renew
// ═══════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS
// USPS deletes a Subscriptions-Tracking subscription after ~25 days with no
// delivered events ("...have not received any events for a period of more than
// 25 days. If no events are received ... in the next 5 days, they will be
// deleted."). Re-creating the subscription makes USPS fire its verification
// handshake at the callback URL, which resets that inactivity clock.
//
// Our /api/shipping/webhook/usps route already answers the handshake
// (the `body.challenge` branch), so a re-create is safe.
//
// HOW TO RUN (creds live in Railway, not in local .env):
//   railway run node scripts/usps-subscription.mjs            # list  (read-only, default)
//   railway run node scripts/usps-subscription.mjs renew      # re-create → resets the 25-day clock
//   railway run node scripts/usps-subscription.mjs renew --force-create
//                                                             # create from template if none found
//
// DESIGN NOTE: the create schema was discovered live by reading USPS's OAS +
// business validation errors (USPS doesn't publish the request body); see
// templateBody() for the confirmed shape. `renew` DELETES the existing
// subscription for this URL first, then creates a fresh one — USPS rejects a
// create whose (URL + alert email) duplicates a live subscription, so
// create-before-delete is impossible. The fresh creation timestamp is what
// resets the 25-day inactivity clock.
// ═══════════════════════════════════════════════════════════════════

const BASE_URL = (process.env.USPS_BASE_URL || 'https://apis.usps.com').replace(/\/$/, '');
const CLIENT_ID = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY || '';
const CLIENT_SECRET =
  process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET || process.env.USPS_SECRET || '';
// `--mid=NNN` overrides the queried MID (a USPS account can hold several MIDs and
// a subscription created under a different one won't show when listing ours).
const midFlag = (process.argv.find((a) => a.startsWith('--mid=')) || '').split('=')[1] || '';
const MID = midFlag || process.env.USPS_MID || process.env.USPS_MAILER_ID || '';
const CRID = process.env.USPS_CRID || '';
const CALLBACK_URL =
  process.env.USPS_WEBHOOK_URL || 'https://www.awulak.com/api/shipping/webhook/usps';

const mode = (process.argv[2] || 'list').toLowerCase();
const forceCreate = process.argv.includes('--force-create');

// Confirmed live against apis.usps.com (2026-06-13): the list/create endpoint is
// /subscriptions-tracking/v3/subscriptions and the ONLY accepted list filter is
// the uppercase `MID` query param. A bare GET → 400 "required field missing"; an
// unknown param → 400 OAS "unexpected query parameter"; a MID with no subs → 404
// "No Subscriptions were found" (endpoint is fine, just empty).
const SUBS_PATH = '/subscriptions-tracking/v3/subscriptions';

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function truncate(s, n = 1200) {
  return s.length > n ? `${s.slice(0, n)}… [${s.length} bytes total]` : s;
}

// USPS echoes the webhook `secret` back in list/error payloads — never print it
// (these logs may end up in CI). Mask any "secret":"..." we're about to display.
function redact(s) {
  return String(s).replace(/("secret"\s*:\s*")[^"]*(")/g, '$1***REDACTED***$2');
}

async function getToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    die('USPS_CLIENT_ID/USPS_CLIENT_SECRET (or CONSUMER_KEY/SECRET) are not set. Run under `railway run`.');
  }
  // Ask for the subscription scopes explicitly; fall back to unscoped if USPS
  // rejects the scope string (mirrors lib/usps.ts behaviour).
  const scopes = 'subscriptions-tracking subscriptions';
  for (const body of [
    { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: scopes },
    { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
  ]) {
    const res = await fetch(`${BASE_URL}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text);
      console.log(`🔑 token ok — granted scopes: ${data.scope || '(none reported)'}`);
      if (data.scope && !/subscriptions/.test(data.scope)) {
        console.warn('⚠️  No "subscriptions*" scope on this token — the subscription calls below will likely 403.');
      }
      return data.access_token;
    }
    console.warn(`   token attempt (${body.scope ? 'scoped' : 'unscoped'}) → ${res.status}: ${truncate(text, 300)}`);
  }
  die('USPS OAuth failed for both scoped and unscoped requests — check credentials / USPS_BASE_URL.');
}

async function api(method, path, token, body, extraHeaders) {
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
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, text, json, etag: res.headers.get('etag') || '' };
}

// DELETE requires an If-Match ETag (USPS optimistic concurrency). Fetch the
// resource to read its current ETag, then delete; refresh + retry once on a 412.
async function deleteWithEtag(path, id, token) {
  const got = await api('GET', `${path}/${encodeURIComponent(id)}`, token);
  let etag = got.etag;
  let del = await api('DELETE', `${path}/${encodeURIComponent(id)}`, token, undefined, etag ? { 'If-Match': etag } : {});
  if (del.status === 412) {
    const fresh = await api('GET', `${path}/${encodeURIComponent(id)}`, token);
    etag = fresh.etag;
    del = await api('DELETE', `${path}/${encodeURIComponent(id)}`, token, undefined, etag ? { 'If-Match': etag } : {});
  }
  return del;
}

// Walk arbitrary JSON, collect objects that mention our callback URL, and pull a
// plausible id off each so we can DELETE the stale one later.
function findMatches(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) findMatches(v, out);
  } else if (node && typeof node === 'object') {
    const blob = JSON.stringify(node);
    if (blob.includes(CALLBACK_URL)) {
      const id =
        node.subscriptionId || node.subscriptionID || node.id ||
        node.subscriptionKey || null;
      out.push({ id, obj: node });
    }
    for (const v of Object.values(node)) findMatches(v, out);
  }
  return out;
}

// Pick the subscription list out of whatever envelope USPS returns.
function extractList(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const key of ['subscriptions', 'data', 'results', 'items', 'content']) {
      if (Array.isArray(json[key])) return json[key];
    }
  }
  return json ? [json] : [];
}

async function listSubscriptions(token) {
  if (!MID) die('A MID is required to list subscriptions. Set USPS_MID or pass --mid=NNN.');
  const full = `${SUBS_PATH}?MID=${encodeURIComponent(MID)}`;
  console.log(`\n🔎 Listing subscriptions for MID ${MID} …`);
  const r = await api('GET', full, token);
  console.log(`   GET ${full} → ${r.status}`);

  // 404 "No Subscriptions were found" = endpoint reached, MID just has none.
  const noneFound = r.status === 404 && /no subscriptions/i.test(r.text);
  if (noneFound) return { reachable: true, list: [] };
  if (r.ok) return { reachable: true, list: extractList(r.json) };

  // Anything else (403 scope lock, 5xx, unexpected 400) — surface it.
  console.log(`   ${truncate(r.text, 400)}`);
  return { reachable: false, list: [] };
}

function templateBody() {
  // Schema confirmed live against apis.usps.com (2026-06-13) by reading the
  // OAS validation errors: a create requires listenerURL + secret (>=32 chars) +
  // filterProperties (oneOf {MID} | {trackingNumber}) + adminNotification (array
  // of objects). The `secret` MUST equal USPS_WEBHOOK_SECRET so USPS's signed
  // verification handshake passes our route's signature check before it answers
  // the challenge — otherwise the subscription never activates.
  if (!MID) die('--force-create needs a MID (USPS_MID or --mid=NNN) to build the subscription.');
  const secret = process.env.USPS_WEBHOOK_SECRET || '';
  if (secret.length < 32) {
    die('USPS_WEBHOOK_SECRET must be set and >=32 chars — it has to match the registered ' +
        'subscription secret so the USPS handshake + events verify at the webhook route.');
  }
  const alertEmail = process.env.USPS_ALERT_EMAIL || 'okyemsamuel@gmail.com';
  return {
    listenerURL: CALLBACK_URL,
    secret,
    filterProperties: { MID },
    // Maps to alertEmailRecipients server-side; each element needs a valid email.
    adminNotification: [{ email: alertEmail }],
  };
}

async function main() {
  console.log('USPS Subscriptions-Tracking keepalive');
  console.log('─'.repeat(50));
  console.log(`base URL : ${BASE_URL}`);
  console.log(`callback : ${CALLBACK_URL}`);
  console.log(`MID/CRID : ${MID || '(unset)'} / ${CRID || '(unset)'}`);
  console.log(`mode     : ${mode}${forceCreate ? ' --force-create' : ''}`);

  const token = await getToken();

  // `get <id>`: authoritative single-resource read (the list endpoint appears
  // cached; GET-by-id reflects writes immediately + returns the ETag).
  if (mode === 'get') {
    const id = process.argv[3];
    if (!id) die('Usage: get <subscriptionId>');
    const r = await api('GET', `${SUBS_PATH}/${encodeURIComponent(id)}`, token);
    console.log(`\nGET ${SUBS_PATH}/${id} → ${r.status}  etag=${r.etag || '(none)'}\n${redact(r.text.trim())}`);
    return;
  }

  const { reachable, list } = await listSubscriptions(token);

  if (!reachable) {
    die('The subscriptions endpoint returned an unexpected error (see above). ' +
        'The subscriptions-tracking scope may be locked behind USPS API Access Controls. ' +
        'Re-register manually at developers.usps.com instead.');
  }

  const path = SUBS_PATH;
  const matches = findMatches(list);
  console.log(`\n📋 Subscriptions found for this callback URL: ${matches.length}`);
  for (const m of matches) console.log(`   • id=${m.id ?? '(no id field)'}  ${redact(truncate(JSON.stringify(m.obj), 300))}`);
  if (list.length && !matches.length) {
    console.log(`   (the endpoint returned ${list.length} subscription(s), none matching ${CALLBACK_URL})`);
  }

  if (mode === 'list') {
    console.log('\n✅ Read-only listing done. Run with `renew` to reset the 25-day clock.');
    return;
  }

  // `probe`: send a deliberately-incomplete body to read USPS's OAS validation
  // errors and learn the required create schema. A 400 creates nothing; if a
  // probe body is unexpectedly accepted we stop and report the created id.
  if (mode === 'probe') {
    const probeBody = (() => {
      try { return JSON.parse(process.argv.find((a) => a.startsWith('--body='))?.split('=').slice(1).join('=') || '{}'); }
      catch { die('--body= must be valid JSON'); }
    })();
    console.log(`\n🧪 PROBE POST ${SUBS_PATH}  body=${redact(JSON.stringify(probeBody))}`);
    const r = await api('POST', SUBS_PATH, token, probeBody);
    console.log(`   → ${r.status}\n${redact(r.text.trim())}`);
    if (r.ok) console.log('\n⚠️  This body was ACCEPTED — a subscription may have been created. Run `list` to check.');
    return;
  }

  if (mode !== 'renew') die(`Unknown mode "${mode}". Use: list | renew | probe`);

  const createBody = templateBody();

  // USPS forbids a create whose (URL + MID) duplicates a live subscription, and
  // its list endpoint (GET ?MID=) is heavily cached — it returns deleted ids and
  // misses fresh ones, so it CANNOT be trusted to find what to delete. Instead:
  // try to create; on a duplicate error USPS names the real conflicting
  // subscriptionId, so delete exactly that (with its ETag) and retry. Immune to
  // list staleness; the `matches` above are informational only.
  console.log('\n➕ Creating subscription (resolving any duplicates the cached list missed) …');
  const deleted = [];
  let created = await api('POST', path, token, createBody);
  for (let attempt = 0; !created.ok && attempt < 5; attempt++) {
    const dupId = created.status === 400
      ? created.text.match(/subscriptionId\s*:\s*([0-9a-fA-F-]{36})/)?.[1]
      : undefined;
    if (!dupId || deleted.includes(dupId)) break;
    console.log(`   ⚠️  duplicate of ${dupId} — deleting it and retrying`);
    const del = await deleteWithEtag(path, dupId, token);
    console.log(`   DELETE ${path}/${dupId} → ${del.status}${del.ok || del.status === 404 ? ' ✅' : `\n${redact(truncate(del.text, 400))}`}`);
    if (!del.ok && del.status !== 404) die(`Could not delete conflicting subscription ${dupId}`);
    deleted.push(dupId);
    created = await api('POST', path, token, createBody);
  }
  console.log(`   POST ${path} → ${created.status}`);
  if (!created.ok) {
    die(`Create failed: ${redact(truncate(created.text, 1500))}`);
  }
  const newId =
    created.json?.subscriptionId || created.json?.subscriptionID ||
    created.json?.id || created.json?.subscriptionKey || '(unknown)';
  console.log(`   ✅ created subscription id=${newId}${deleted.length ? ` (replaced ${deleted.join(', ')})` : ''}`);
  console.log('   USPS will now POST a verification handshake to the callback URL — clock reset.');

  console.log('\n✅ Renew complete. The "no events for 25 days" warning should clear.');
  console.log('   NOTE: while you ship via EasyPost (not your own MID), this subscription receives no');
  console.log('   real events, so it will go idle again in ~25 days. Re-run this then, or schedule it.');
}

main().catch((e) => die(e instanceof Error ? e.stack || e.message : String(e)));
