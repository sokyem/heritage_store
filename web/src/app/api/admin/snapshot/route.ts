import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/**
 * Unified activity snapshot for the admin dashboard.
 * Query: ?range=day | week | month
 *
 * Returns counts and lists for everything that happened in the window:
 * new signups, new orders, custom requests, consultations booked, payments,
 * shipments, messages, etc.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || 'day').toLowerCase();

  const now = new Date();
  let since: Date;
  if (range === 'week') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === 'month') {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // day = since midnight today
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  try {
    const [
      newClients,
      newClientList,
      newAdminOrders,
      newAdminOrderList,
      newCustomOrders,
      newCustomOrderList,
      newRentals,
      newConsultations,
      newConsultationList,
      newQuotes,
      newPayments,
      paidSum,
      newActivity,
      newReturns,
      newMessagesGroups,
    ] = await Promise.all([
      prisma.client.count({ where: { createdAt: { gte: since } } }),
      prisma.client.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, createdAt: true, vipTier: true },
      }),
      prisma.adminOrder.count({ where: { createdAt: { gte: since } } }),
      prisma.adminOrder.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { client: { select: { name: true, email: true } } },
      }),
      prisma.customOrder.count({ where: { createdAt: { gte: since } } }),
      prisma.customOrder.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { client: { select: { name: true, email: true } } },
      }),
      prisma.rentalOrder.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      prisma.adminConsultation.count({ where: { createdAt: { gte: since } } }),
      prisma.adminConsultation.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { client: { select: { name: true, email: true } } },
      }),
      prisma.quote.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      prisma.payment.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      prisma.payment
        .aggregate({
          where: { createdAt: { gte: since }, status: { in: ['succeeded', 'paid', 'completed'] } },
          _sum: { amount: true },
        })
        .catch(() => ({ _sum: { amount: 0 } } as any)),
      prisma.orderActivity.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.returnRequest.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      prisma.message
        .groupBy({
          by: ['conversationId'],
          where: { createdAt: { gte: since } },
          _count: true,
        })
        .catch(() => [] as any[]),
    ]);

    return NextResponse.json({
      range,
      since: since.toISOString(),
      now: now.toISOString(),
      counts: {
        newClients,
        newAdminOrders,
        newCustomOrders,
        newRentals,
        newConsultations,
        newQuotes,
        newPayments,
        revenue: (paidSum as any)?._sum?.amount || 0,
        newActivity: newActivity.length,
        newReturns,
        newConversationsWithMessages: Array.isArray(newMessagesGroups) ? newMessagesGroups.length : 0,
      },
      lists: {
        newClients: newClientList,
        newAdminOrders: newAdminOrderList.map((o) => ({
          id: o.id,
          orderId: o.orderId,
          item: o.item,
          status: o.status,
          totalPrice: o.totalPrice,
          totalPaid: o.totalPaid,
          createdAt: o.createdAt,
          client: o.client,
        })),
        newCustomOrders: newCustomOrderList.map((o) => ({
          id: o.id,
          orderId: o.orderId,
          status: o.status,
          totalPrice: (o as any).finalPrice ?? (o as any).estimatedPrice ?? null,
          createdAt: o.createdAt,
          client: o.client,
        })),
        newConsultations: newConsultationList.map((c) => ({
          id: c.id,
          scheduledDate: c.scheduledDate,
          scheduledTime: c.scheduledTime,
          status: c.status,
          purpose: c.purpose,
          createdAt: c.createdAt,
          client: c.client,
        })),
        recentActivity: newActivity,
      },
    });
  } catch (error) {
    console.error('snapshot error', error);
    return NextResponse.json({ error: 'Failed to load snapshot' }, { status: 500 });
  }
}
