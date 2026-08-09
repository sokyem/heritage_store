/**
 * GET /api/admin/clients/export
 *
 * Streams a CSV of all clients (the studio customer roster). Honors the
 * same `search` filter as the list endpoint so admins can export whatever
 * is currently on screen. Capped at 10k rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { toCsv, csvFilename } from '@/lib/csv';

const MAX_ROWS = 10_000;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { clientId: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
          { instagram: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const clients = await prisma.client.findMany({
    where,
    orderBy: { clientId: 'asc' },
    take: MAX_ROWS,
    include: { _count: { select: { orders: true } } },
  });

  const rows = clients.map((c) => ({
    clientId: c.clientId,
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    instagram: c.instagram ?? '',
    gender: c.gender ?? '',
    vipTier: c.vipTier ?? '',
    city: c.city ?? '',
    orderCount: c._count?.orders ?? 0,
    createdAt: c.createdAt,
    notes: c.notes ?? '',
  }));

  const csv = toCsv(rows, [
    { key: 'clientId', header: 'Client ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'instagram', header: 'Instagram' },
    { key: 'gender', header: 'Gender' },
    { key: 'vipTier', header: 'VIP Tier' },
    { key: 'city', header: 'City' },
    { key: 'orderCount', header: 'Orders' },
    { key: 'createdAt', header: 'Created At' },
    { key: 'notes', header: 'Notes' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('clients')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
