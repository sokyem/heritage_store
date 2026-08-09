import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/finance?from=YYYY-MM-DD&to=YYYY-MM-DD&source=stripe|paypal|manual|all
//
// Unified view of all money movement — Stripe + PayPal payments
// (storefront `Payment` table) merged with manual studio payments
// (`PaymentRecord` table). Returns one normalized list and per-source totals.

const PAID_STATUSES = ['succeeded', 'paid', 'completed'];
const REFUNDED_STATUSES = ['refunded', 'partially_refunded'];

interface UnifiedPayment {
  id: string;
  source: 'stripe' | 'paypal' | 'manual';
  amount: number;
  currency: string;
  status: string;
  method: string;
  customerName: string | null;
  customerEmail: string | null;
  orderRef: string | null;
  description: string | null;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const source = (url.searchParams.get('source') || 'all').toLowerCase();

  // Default window: last 30 days.
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : now;
  // Make `to` end-of-day so a same-day filter doesn't miss the day's records.
  to.setHours(23, 59, 59, 999);

  const wantStripeOrPaypal = source === 'all' || source === 'stripe' || source === 'paypal';
  const wantManual = source === 'all' || source === 'manual';

  const [storefrontPayments, manualPayments] = await Promise.all([
    wantStripeOrPaypal
      ? prisma.payment.findMany({
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        })
      : Promise.resolve([]),
    wantManual
      ? prisma.paymentRecord.findMany({
          where: { createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: 'desc' },
          include: { order: { select: { id: true, client: { select: { name: true, email: true } } } } },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const list: UnifiedPayment[] = [];

  for (const p of storefrontPayments) {
    const isPaypal = Boolean(p.paypalOrderId);
    const itemSource: UnifiedPayment['source'] = isPaypal ? 'paypal' : 'stripe';
    if (source !== 'all' && source !== itemSource) continue;
    list.push({
      id: p.id,
      source: itemSource,
      amount: p.amount,
      currency: p.currency || 'USD',
      status: p.status,
      method: p.paymentMethod || (isPaypal ? 'paypal' : 'card'),
      customerName: p.user?.name || null,
      customerEmail: p.user?.email || null,
      orderRef: p.orderId,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    });
  }

  for (const r of manualPayments) {
    list.push({
      id: r.id,
      source: 'manual',
      amount: r.amount || 0,
      currency: 'USD',
      // PaymentRecord has no status column — the row existing means received.
      status: 'paid',
      method: r.method || 'manual',
      customerName: r.order?.client?.name || r.client || null,
      customerEmail: r.order?.client?.email || null,
      orderRef: r.orderId,
      description: r.notes,
      createdAt: (r.date || r.createdAt).toISOString(),
    });
  }

  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Per-source totals + a grand total. Only count "paid" rows toward revenue;
  // refunds tracked separately so a partial-refund day doesn't read negative.
  const totals = {
    grossRevenue: 0,
    refunds: 0,
    netRevenue: 0,
    transactionCount: list.length,
    bySource: { stripe: 0, paypal: 0, manual: 0 } as Record<'stripe' | 'paypal' | 'manual', number>,
  };
  for (const item of list) {
    if (PAID_STATUSES.includes(item.status)) {
      totals.grossRevenue += item.amount;
      totals.bySource[item.source] += item.amount;
    } else if (REFUNDED_STATUSES.includes(item.status)) {
      totals.refunds += item.amount;
    }
  }
  totals.netRevenue = totals.grossRevenue - totals.refunds;

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    source,
    totals,
    payments: list,
  });
}
