import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { jaasAppId } from '@/lib/jaas';
import { transcribeRecordingFromUrl } from '@/lib/transcribe-recording';
import { summarizeConsultation } from '@/lib/summarize';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Background job: transcribe a recording (one retry on failure), then
 * auto-generate a summary. Updates transcriptStatus so the admin page can show
 * pending/failed instead of a silently-empty transcript. Runs detached from the
 * webhook response — Railway's persistent server keeps the promise alive.
 */
async function transcribeAndSummarize(bookingId: string, url: string): Promise<void> {
  let text = '';
  for (let attempt = 1; attempt <= 2 && !text; attempt++) {
    try {
      text = await transcribeRecordingFromUrl(url);
    } catch (err) {
      console.error(`[jaas-webhook] transcription attempt ${attempt} failed:`, err);
      if (attempt < 2) await sleep(10_000);
    }
  }

  if (!text) {
    await prisma.consultationBooking
      .update({ where: { id: bookingId }, data: { transcriptStatus: 'failed' } })
      .catch((e) => console.error('[jaas-webhook] failed to mark transcript failed:', e));
    return;
  }

  // Auto-summarize so the designer has notes waiting — best-effort; a summary
  // failure must not lose the transcript we just captured.
  let summary = '';
  try {
    summary = await summarizeConsultation({ transcript: text });
  } catch (err) {
    console.error('[jaas-webhook] auto-summary failed:', err);
  }

  await prisma.consultationBooking
    .update({
      where: { id: bookingId },
      data: { callTranscript: text, transcriptStatus: 'done', ...(summary ? { callSummary: summary } : {}) },
    })
    .then(() => console.log(`[jaas-webhook] transcript${summary ? ' + summary' : ''} saved for booking ${bookingId}`))
    .catch((e) => console.error('[jaas-webhook] failed to save transcript:', e));
}

// POST /api/video/jaas-webhook
//
// Receives JaaS (8x8) webhook events and attaches finished cloud recordings to
// the matching consultation booking — the same way the post-call page saves the
// transcript/notes (matched by the room id in the booking's meetingLink).
//
// Configure in the JaaS console (Webhooks) with a URL like:
//   https://www.awulak.com/api/video/jaas-webhook?key=<JAAS_WEBHOOK_SECRET>
// and enable the recording events. Set JAAS_WEBHOOK_SECRET (or JASS_WEBHOOK_SECRET)
// in Railway to the same value so we can reject forged requests.
//
// This route hits the DB and must never be statically prerendered.
export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET =
  process.env.JAAS_WEBHOOK_SECRET || process.env.JASS_WEBHOOK_SECRET || '';

// JaaS namespaces our rooms as "<appId>/AwulaKConsultation-<rawRoom>" and the
// webhook `fqn` is usually lowercased — pull the original booking room id back.
function roomFromFqn(fqn: string): string {
  const segment = fqn.split('/').pop() || fqn;
  return segment.replace(/^awulakconsultation-/i, '');
}

// JaaS recording payloads vary by event/version — pull the first usable link.
function extractRecordingUrl(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const rec = (data.recording as Record<string, unknown> | undefined) || undefined;
  const candidates = [
    data.preAuthenticatedLink,
    rec?.url,
    rec?.previewUrl,
    data.url,
    data.link,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Reject forged calls when a shared secret is configured.
    if (WEBHOOK_SECRET) {
      const key =
        new URL(req.url).searchParams.get('key') ||
        req.headers.get('x-webhook-secret') ||
        '';
      if (key !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => null)) as
      | { eventType?: string; appId?: string; fqn?: string; data?: Record<string, unknown> }
      | null;
    if (!body) return NextResponse.json({ ok: true, ignored: 'no body' });

    // Defense in depth: ignore events for any other JaaS app.
    if (jaasAppId && body.appId && body.appId !== jaasAppId) {
      return NextResponse.json({ ok: true, ignored: 'appId mismatch' });
    }

    // We only care about a finished, uploaded recording.
    const type = (body.eventType || '').toUpperCase();
    if (!type.includes('RECORDING') || (!type.includes('UPLOADED') && !type.includes('ENDED'))) {
      return NextResponse.json({ ok: true, ignored: `event ${body.eventType || 'unknown'}` });
    }

    const url = extractRecordingUrl(body.data);
    if (!url) return NextResponse.json({ ok: true, ignored: 'no recording url in payload' });

    const room = roomFromFqn(body.fqn || '');
    if (!room) return NextResponse.json({ ok: true, ignored: 'no room in fqn' });

    // Match the booking the same way the notes endpoint does.
    const booking = await prisma.consultationBooking.findFirst({
      where: { meetingLink: { endsWith: `room=${room}` } },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) {
      // Ad-hoc/instant calls have no booking — acknowledge so JaaS stops retrying.
      return NextResponse.json({ ok: true, saved: false, reason: 'no booking for room' });
    }

    await prisma.consultationBooking.update({
      where: { id: booking.id },
      data: { callRecordingUrl: url, callRecordingAt: new Date() },
    });

    // Idempotency: JaaS fires both RECORDING_UPLOADED and …ENDED, and retries
    // on non-2xx. Only one transcription run per booking — skip if one is
    // already in flight or finished.
    if (booking.transcriptStatus === 'processing' || booking.transcriptStatus === 'done') {
      return NextResponse.json({ ok: true, saved: true, bookingId: booking.id, transcript: 'skipped' });
    }

    // Claim the job synchronously (await) so a concurrent duplicate webhook
    // sees 'processing' and bails, then run the slow work in the background.
    await prisma.consultationBooking.update({
      where: { id: booking.id },
      data: { transcriptStatus: 'processing' },
    });
    void transcribeAndSummarize(booking.id, url);

    return NextResponse.json({ ok: true, saved: true, bookingId: booking.id });
  } catch (error) {
    console.error('JaaS webhook error:', error);
    // Return 200 so JaaS doesn't hammer us with retries on a transient error;
    // the failure is logged for investigation.
    return NextResponse.json({ ok: false, error: 'handler error' });
  }
}
