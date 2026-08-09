import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { listEmailTemplatesForAdmin } from '@/lib/email-templates';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;
  const templates = await listEmailTemplatesForAdmin();
  return NextResponse.json({ templates });
}

export const dynamic = 'force-dynamic';
