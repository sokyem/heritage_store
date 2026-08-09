/**
 * Daily.co video rooms.
 *
 * Replaces the old meet.jit.si links, which forced a Google/GitHub login
 * before any meeting could start ("no moderators have arrived"). Daily
 * rooms have NO login and NO moderator wait — both the customer and the
 * admin just open the URL and they're instantly in the call.
 *
 * The API key (DAILY_CO_API_KEY) is server-side only. Rooms are created
 * on the server when a consultation is booked; the room URL is stored as
 * the booking's meetingLink and shared via email / SMS / dashboard.
 */

const DAILY_API_KEY = process.env.DAILY_CO_API_KEY || process.env.DAILY_API_KEY || '';
const DAILY_BASE = 'https://api.daily.co/v1';

export function isDailyConfigured(): boolean {
  return Boolean(DAILY_API_KEY);
}

export interface DailyRoom {
  name: string;
  url: string;
}

/**
 * Create a Daily.co room. Returns null on any failure (missing key, API
 * error, network) so callers can fall back gracefully — booking must
 * never break just because video provisioning hiccuped.
 *
 * @param expiresInDays  room auto-expires after this many days (default 30)
 */
export async function createDailyRoom(
  opts: { expiresInDays?: number } = {},
): Promise<DailyRoom | null> {
  if (!DAILY_API_KEY) {
    console.warn('[daily] DAILY_CO_API_KEY not set — skipping room creation');
    return null;
  }

  const expDays = opts.expiresInDays ?? 30;
  const exp = Math.floor(Date.now() / 1000) + expDays * 24 * 60 * 60;

  try {
    const res = await fetch(`${DAILY_BASE}/rooms`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        privacy: 'public', // anyone with the link joins — no login
        properties: {
          exp, // room self-destructs after expDays
          enable_chat: true,
          enable_screenshare: true,
          enable_prejoin_ui: true, // camera/mic check screen before joining
          enable_knocking: false, // no waiting room — straight in
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[daily] room creation failed: ${res.status} ${body}`);
      return null;
    }

    const data = (await res.json()) as { name?: string; url?: string };
    if (!data.url || !data.name) {
      console.error('[daily] room creation returned no url:', data);
      return null;
    }
    return { name: data.name, url: data.url };
  } catch (err) {
    console.error('[daily] room creation error:', err);
    return null;
  }
}

/**
 * Delete a Daily room by name. Best-effort — used when a booking is
 * cancelled. Failures are swallowed.
 */
export async function deleteDailyRoom(roomName: string): Promise<void> {
  if (!DAILY_API_KEY || !roomName) return;
  try {
    await fetch(`${DAILY_BASE}/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    });
  } catch (err) {
    console.error('[daily] room deletion error:', err);
  }
}

/** Extract the Daily room name from a full room URL (last path segment). */
export function dailyRoomNameFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes('.daily.co/')) return null;
  const seg = url.split('/').filter(Boolean).pop();
  return seg || null;
}
