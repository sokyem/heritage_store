import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// ONE-TIME seed endpoint — remove after use
// GET or POST /api/admin/seed?key=awulak-seed-2026
// NOTE: This bypasses auth intentionally — it's a bootstrap endpoint.

const SEED_KEY = 'awulak-seed-2026';

async function runSeed(req: NextRequest) {
  const key = new URL(req.url).searchParams.get('key');
  if (key !== SEED_KEY) {
    return NextResponse.json({ error: 'Invalid seed key' }, { status: 403 });
  }

  try {
    const results: string[] = [];

    // ─── Clients ──────────────────────────────────────────
    const clients = [
      { clientId: 'C-001', name: 'Senna Bride', gender: 'female', vipTier: 'vip' },
      { clientId: 'C-002', name: 'Kanyan Bride', gender: 'female', vipTier: 'vip' },
      { clientId: 'C-003', name: 'Alteration Client', gender: null, vipTier: 'standard' },
      { clientId: 'C-004', name: 'Mrs Brown Mum', gender: 'female', vipTier: 'standard', notes: "Listed as 'Mrs Brown mum'. Verify client name spelling." },
      { clientId: 'C-005', name: 'Daizara Pam', gender: 'female', vipTier: 'standard' },
      { clientId: 'C-006', name: 'Bride (Julia)', gender: 'female', vipTier: 'vip' },
      { clientId: 'C-007', name: 'Tga Baby', gender: 'female', vipTier: 'standard' },
      { clientId: 'C-008', name: 'Mrs Brown', gender: 'female', vipTier: 'standard' },
      { clientId: 'C-009', name: 'Miss Pam', gender: 'female', vipTier: 'standard' },
    ];

    for (const c of clients) {
      await prisma.client.upsert({
        where: { clientId: c.clientId },
        update: { name: c.name },
        create: { clientId: c.clientId, name: c.name, gender: c.gender, vipTier: c.vipTier, notes: (c as any).notes || null },
      });
      results.push(`Client: ${c.clientId} — ${c.name}`);
    }

    // ─── Orders ───────────────────────────────────────────
    const orders = [
      { orderId: 'AWK-001', clientId: 'C-001', item: 'Bridal order bundle', fabric: null, status: 'Fabric Sourced', dueDate: 'May (first week)', notes: "Reception look; possible 'wedding kente' look; wedding dress", orderType: 'custom' },
      { orderId: 'AWK-002', clientId: 'C-002', item: 'Wedding dress', fabric: null, status: 'Sewing', dueDate: 'April', notes: 'Transcribed from handwriting; verify client name spelling.', orderType: 'custom' },
      { orderId: 'AWK-003', clientId: 'C-003', item: 'Alteration (x3) - Beaded lace tops', fabric: 'Beaded lace', status: 'Inquiry', dueDate: 'April (first week)', notes: 'Client name not shown clearly in notebook.', orderType: 'alteration' },
      { orderId: 'AWK-004', clientId: 'C-004', item: 'Alteration', fabric: null, status: 'Inquiry', dueDate: 'Sunday', notes: 'Verify client name spelling.', orderType: 'alteration' },
      { orderId: 'AWK-005', clientId: 'C-005', item: 'Prom dress', fabric: null, status: 'Inquiry', dueDate: 'May 30', notes: 'Verify client name spelling.', orderType: 'custom' },
      { orderId: 'AWK-006', clientId: 'C-006', item: 'Bridal order', fabric: null, status: 'Inquiry', dueDate: 'June', notes: null, orderType: 'custom' },
      { orderId: 'AWK-007', clientId: 'C-007', item: 'Corset top; Kente dress', fabric: 'Kente', status: 'Inquiry', dueDate: null, notes: 'Two pieces listed: 1) Corset top 2) Kente dress. Verify client name.', orderType: 'custom' },
      { orderId: 'AWK-008', clientId: 'C-008', item: 'Jeans dress; Flower top', fabric: 'Denim / floral', status: 'Inquiry', dueDate: null, notes: 'Two pieces listed: 1) Jeans Dress 2) Flower top.', orderType: 'custom' },
      { orderId: 'AWK-009', clientId: 'C-009', item: '30 yrs wedding revamp', fabric: null, status: 'Inquiry', dueDate: 'April (21 days)', notes: "30 yrs wedding revamp. Verify exact wording.", orderType: 'custom' },
    ];

    for (const o of orders) {
      const client = await prisma.client.findUnique({ where: { clientId: o.clientId } });
      if (!client) { results.push(`SKIP ${o.orderId}: client not found`); continue; }

      await prisma.adminOrder.upsert({
        where: { orderId: o.orderId },
        update: { item: o.item, fabric: o.fabric, status: o.status, dueDate: o.dueDate, notes: o.notes },
        create: {
          orderId: o.orderId,
          clientId: client.id,
          item: o.item,
          fabric: o.fabric,
          totalPrice: 0,
          deposit: 0,
          totalPaid: 0,
          balance: 0,
          status: o.status,
          orderType: o.orderType,
          dueDate: o.dueDate,
          notes: o.notes,
          paymentStatus: 'pending',
        },
      });
      results.push(`Order: ${o.orderId} — ${o.item} (${o.status})`);
    }

    // ─── Promote founder account ───────────────────────────
    const founderEmail = 'kamteye@gmail.com';
    try {
      const user = await prisma.user.update({
        where: { email: founderEmail },
        data: { role: 'founder' },
      });
      results.push(`Promoted ${user.email} to founder`);
    } catch {
      results.push(`User ${founderEmail} not found — sign up first, then re-run`);
    }

    // Also promote via body if provided
    const body = await req.json().catch(() => ({}));
    if (body.promoteEmail && body.promoteEmail !== founderEmail) {
      try {
        const user = await prisma.user.update({
          where: { email: body.promoteEmail },
          data: { role: 'founder' },
        });
        results.push(`Promoted ${user.email} to founder`);
      } catch {
        results.push(`User ${body.promoteEmail} not found`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Support both GET (browser) and POST (curl)
export async function GET(req: NextRequest) {
  return runSeed(req);
}

export async function POST(req: NextRequest) {
  return runSeed(req);
}
