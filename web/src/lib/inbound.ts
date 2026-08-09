// Per-thread email reply routing.
//
// Outbound customer emails set a Reply-To at the inbound subdomain that encodes
// which thread they belong to (e.g. order_<id>@reply.awulak.com). SendGrid
// Inbound Parse delivers the customer's reply to /api/email/inbound, which
// decodes the token and files the message back into the right order thread or
// inbox conversation — so every conversation lives in the app.
//
// Setup (one-time, in SendGrid + DNS):
//   1. Pick a subdomain, e.g. reply.awulak.com, and add an MX record:
//        reply.awulak.com.  MX  10  mx.sendgrid.net.
//   2. SendGrid → Settings → Inbound Parse → add host `reply.awulak.com`,
//      destination URL https://www.awulak.com/api/email/inbound?key=<secret>
//   3. Set INBOUND_DOMAIN=reply.awulak.com and INBOUND_WEBHOOK_SECRET=<secret>
//      in Railway. Until INBOUND_DOMAIN is set, emails use the default Reply-To
//      and replies keep going to the external mailbox (manual "Log reply").

const INBOUND_DOMAIN = process.env.INBOUND_DOMAIN || '';

export function inboundConfigured(): boolean {
  return Boolean(INBOUND_DOMAIN);
}

export type ThreadKind = 'order' | 'conv';

/**
 * Build a Reply-To that routes a customer's reply back to this thread. Returns
 * undefined when no inbound domain is configured so callers fall back to the
 * default Reply-To.
 */
export function threadReplyTo(kind: ThreadKind, id: string): string | undefined {
  if (!INBOUND_DOMAIN || !id) return undefined;
  return `AWULA K <${kind}_${id}@${INBOUND_DOMAIN}>`;
}

/**
 * Decode a recipient address (possibly "Name <local@domain>", or a raw local
 * part) into its thread token. Cuid ids are lowercase alphanumeric, so the
 * `<kind>_<id>` local part parses unambiguously.
 */
export function parseThreadAddress(addr: string | null | undefined): { kind: ThreadKind; id: string } | null {
  if (!addr) return null;
  const at = addr.match(/([A-Za-z0-9._%+-]+)@/);
  const local = (at ? at[1] : addr).trim().toLowerCase();
  const m = local.match(/^(order|conv)_([a-z0-9]+)$/);
  if (!m) return null;
  return { kind: m[1] as ThreadKind, id: m[2] };
}

/**
 * Strip quoted reply history and common signatures from an inbound plain-text
 * email so only the customer's new message is stored. Best-effort.
 */
export function extractReplyText(text: string): string {
  if (!text) return '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    // Common reply separators — everything below is quoted history.
    if (/^\s*On .+ wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^_{5,}\s*$/.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length > 0) break;
    if (/^\s*>/.test(line)) continue; // quoted line
    out.push(line);
  }
  return out.join('\n').trim();
}
