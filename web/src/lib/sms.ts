// SMS delivery via Twilio's REST API (no SDK dependency — plain fetch).
// If Twilio is not configured the message is logged and treated as sent,
// so booking flows never fail just because SMS is unconfigured.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export function isSMSConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

/** Turn a relative path (e.g. /video-call?room=x) into a full public URL. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = APP_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export interface SMSResult {
  ok: boolean;
  mocked?: boolean;
  error?: string;
}

/** Send a single SMS. Returns { ok } — never throws. */
export async function sendSMS(to: string | null | undefined, body: string): Promise<SMSResult> {
  if (!to || !to.trim()) {
    return { ok: false, error: 'No phone number on file' };
  }

  if (!isSMSConfigured()) {
    console.log(`[SMS-MOCK] -> ${to}: ${body}`);
    return { ok: true, mocked: true };
  }

  try {
    const params = new URLSearchParams({ To: to.trim(), From: FROM_NUMBER!, Body: body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error('Twilio SMS failed:', res.status, detail);
      // Surface Twilio's human-readable message when present.
      let msg = `SMS provider error (${res.status})`;
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.message) msg = parsed.message;
      } catch {}
      return { ok: false, error: msg };
    }

    return { ok: true };
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown SMS error' };
  }
}

/** Build the consultation confirmation text sent to a client. */
export function buildConsultationSMS(opts: {
  customerName?: string | null;
  date: Date | string;
  startTime: string;
  endTime?: string | null;
  type: string;
  duration?: number | null;
  meetingLink?: string | null;
  rescheduled?: boolean;
}): string {
  const dateStr = new Date(opts.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const typeLabel =
    opts.type === 'in_person'
      ? 'In-person'
      : opts.type.charAt(0).toUpperCase() + opts.type.slice(1);

  const lines: string[] = [];
  lines.push(opts.rescheduled ? 'AWULA K — Consultation Rescheduled' : 'AWULA K — Consultation Confirmed');
  if (opts.customerName) lines.push(`Hi ${opts.customerName.split(' ')[0]},`);
  if (opts.rescheduled) lines.push('Your consultation has a new time:');
  lines.push(
    `${dateStr} at ${opts.startTime}${opts.endTime ? `–${opts.endTime}` : ''}` +
      `${opts.duration ? ` (${opts.duration} min)` : ''}`,
  );
  lines.push(`Type: ${typeLabel}`);
  if (opts.meetingLink) {
    lines.push(`Join your video consultation here: ${absoluteUrl(opts.meetingLink)}`);
  }
  lines.push('Questions? Just reply to this text. We look forward to seeing you.');
  return lines.join('\n');
}
