import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMAS,
  getSetting,
  saveSetting,
  type SettingsKey,
} from '@/lib/settings';

function isValidKey(key: string): key is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMAS, key);
}

// GET /api/admin/settings/[key]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json({ error: `Unknown settings section: ${key}` }, { status: 404 });
  }

  try {
    const value = await getSetting(key);
    return NextResponse.json({ key, value });
  } catch (err) {
    console.error(`[settings] GET ${key} failed`, err);
    // Degrade gracefully — clients tolerate the default and we avoid 500 noise.
    return NextResponse.json({ key, value: DEFAULT_SETTINGS[key] });
  }
}

// PUT /api/admin/settings/[key]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json({ error: `Unknown settings section: ${key}` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = (body as { value?: unknown })?.value ?? body;

  try {
    const previous = await getSetting(key);
    const saved = await saveSetting(key, payload as any, {
      id: (auth.session?.user as any)?.id ?? null,
      email: auth.email,
    });

    // Shipping integrations cache the shipper row in-process — invalidate so
    // the next label call sees the new address immediately.
    if (key === 'shipper') {
      const { invalidateShipperAddressCache } = await import('@/lib/shipper-address');
      invalidateShipperAddressCache();
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'AppSetting',
      entityId: key,
      summary: `Updated ${key} settings`,
      diff: { before: previous, after: saved },
      ip: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ key, value: saved });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', issues: err.issues },
        { status: 422 },
      );
    }
    console.error('[settings] PUT failed', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
