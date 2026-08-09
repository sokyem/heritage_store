import { SignJWT, importPKCS8 } from 'jose';

// JaaS (8x8 Jitsi-as-a-Service): un-capped, branded Jitsi using the same
// in-app video UI. Active only when all three env vars are set; otherwise the
// app falls back to free public meet.jit.si (which caps anonymous calls).
//
//   JAAS_APP_ID       — your "vpaas-magic-cookie-…" App ID
//   JAAS_KID          — the API key id from the JaaS console (often
//                       "<AppID>/<keyid>")
//   JAAS_PRIVATE_KEY  — the RSA private key (PEM). In Railway, paste it with
//                       literal \n escapes or as a multiline value.
// Accept the common "JASS" misspelling too. KID falls back to the API key id.
const JAAS_APP_ID = process.env.JAAS_APP_ID || process.env.JASS_APP_ID || '';
const JAAS_KID = process.env.JAAS_KID || process.env.JASS_KID || process.env.JAAS_API_KEY || process.env.JASS_API_KEY || '';

// Repair a hand-pasted PEM before jose's strict importPKCS8 sees it. Env
// managers (and our own .env) have shipped keys with literal "\n" escapes,
// wrapping quotes, and — observed in production — the BEGIN/END markers typed
// with the wrong number of dashes (e.g. "-------BEGIN PRIVATE KEY-----").
// importPKCS8 rejects all of these with "must be PKCS#8 formatted string",
// which silently kills token minting and drops every call to anonymous Jitsi.
// Normalize the markers to exactly five dashes so a valid key body still works.
function normalizePem(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/-+\s*BEGIN ([A-Z0-9 ]+?)\s*-+/g, '-----BEGIN $1-----')
    .replace(/-+\s*END ([A-Z0-9 ]+?)\s*-+/g, '-----END $1-----');
}

const JAAS_PRIVATE_KEY = normalizePem(process.env.JAAS_PRIVATE_KEY || process.env.JASS_PRIVATE_KEY || '');

export function isJaasConfigured(): boolean {
  return Boolean(JAAS_APP_ID && JAAS_KID && JAAS_PRIVATE_KEY);
}

export const jaasAppId = JAAS_APP_ID;
export const jaasDomain = '8x8.vc';

/** Mint a short-lived JaaS JWT for a room. Returns null when JaaS isn't set. */
export async function mintJaasToken(opts: {
  room: string;
  name?: string | null;
  email?: string | null;
  moderator?: boolean;
}): Promise<string | null> {
  if (!isJaasConfigured()) return null;

  let key;
  try {
    key = await importPKCS8(JAAS_PRIVATE_KEY, 'RS256');
  } catch (err) {
    // A bad private key must not 500 the token route (that drops the call to
    // anonymous public Jitsi). Log loudly so it's diagnosable in Railway, and
    // return null so the client falls back gracefully.
    console.error('[jaas] private key failed to parse — check JAAS_PRIVATE_KEY PEM:', err instanceof Error ? err.message : err);
    return null;
  }
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    aud: 'jitsi',
    iss: 'chat',
    sub: JAAS_APP_ID,
    room: opts.room || '*',
    context: {
      user: {
        id: opts.email || opts.name || 'guest',
        name: opts.name || 'Awula Guest',
        email: opts.email || '',
        moderator: opts.moderator ? 'true' : 'false',
      },
      features: {
        livestreaming: 'false',
        // Recording is moderator-only: admins/staff can record a consultation,
        // customers joining via their link cannot start one.
        recording: opts.moderator ? 'true' : 'false',
        transcription: 'true',
        'outbound-call': 'false',
      },
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: JAAS_KID, typ: 'JWT' })
    .setIssuedAt(now)
    .setNotBefore(now - 10)
    .setExpirationTime(now + 3 * 60 * 60) // 3h
    .sign(key);
}
