import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getSettings } from '@/lib/settings';

// GET /api/admin/settings — return every section merged with defaults.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const settings = await getSettings();
  return NextResponse.json({ settings });
}
