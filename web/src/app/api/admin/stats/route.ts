import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { getSetting } from '@/lib/settings';


// Wrap a possibly-failing query so a single broken table/column does not
// take down the entire admin dashboard. The specific failure is logged so
// it remains debuggable. Fallback is accepted as a widened type because
// some Prisma generics (e.g. aggregate) over-specify shapes we don't need.
async function safe<T>(label: string, p: Promise<T>, fallback: unknown): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[admin/stats] ${label} failed:`, err);
    return fallback as T;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    let lowStockThreshold = 5;
    try {
      const notifSettings = await getSetting('notifications');
      lowStockThreshold = notifSettings.lowStockThreshold ?? 5;
    } catch (err) {
      console.error('[admin/stats] getSetting(notifications) failed:', err);
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const activeAdminStatuses = [
      'Inquiry', 'Awaiting Deposit', 'Fabric Sourced',
      'Cutting', 'Sewing', 'Fitting', 'Finishing', 'Ready',
    ];
    const activeCustomStatuses = [
      'inquiry_received', 'consultation_scheduled', 'consultation_completed',
      'measurements_received', 'quote_sent', 'deposit_paid', 'fabric_assigned',
      'in_production', 'fitting_scheduled', 'alteration_in_progress',
      'final_payment_pending', 'ready_for_delivery',
    ];

    const [
      adminRevenue,
      customRevenue,
      activeAdminOrders,
      activeCustomOrders,
      pendingCustomRequests,
      todayConsultations,
      lowStockItems,
      recentOrders,
      customOrdersByStatus,
      adminOrdersByStatus,
      upcomingConsultations,
      upcomingFittings,
      topDesigners,
      recentActivity,
      overdueAdminOrders,
      overdueCustomOrders,
      customAwaitingDeposit,
      rentalTotal,
      rentalActive,
      rentalRevenue,
      clientTotal,
      clientVip,
      clientNewThisMonth,
      consultTotal,
      consultScheduled,
      consultCompleted,
      fabricTotal,
      quoteTotal,
      quotePending,
      quoteAccepted,
      designerTotal,
      designerActive,
      productTotal,
      productPublished,
      productFeatured,
    ] = await Promise.all([
      // Revenue
      safe('adminOrder.aggregate', prisma.adminOrder.aggregate({ _sum: { totalPaid: true } }), { _sum: { totalPaid: 0 } }),
      safe('customOrder.aggregate', prisma.customOrder.aggregate({ _sum: { totalPaid: true } }), { _sum: { totalPaid: 0 } }),

      // Active orders
      safe('adminOrder.activeCount', prisma.adminOrder.count({ where: { status: { in: activeAdminStatuses } } }), 0),
      safe('customOrder.activeCount', prisma.customOrder.count({ where: { status: { in: activeCustomStatuses } } }), 0),

      // Pending custom requests
      safe('customOrder.pendingCount', prisma.customOrder.count({ where: { status: 'inquiry_received' } }), 0),

      // Today's consultations
      safe('adminConsultation.todayCount', prisma.adminConsultation.count({
        where: {
          scheduledDate: { gte: todayStart, lt: todayEnd },
          status: { not: 'cancelled' },
        },
      }), 0),

      // Low stock
      safe('fabricInventory.lowStock', prisma.fabricInventory.findMany({
        where: {
          OR: [
            { quantity: { lt: 5 } },
          ],
        },
      }), []),

      // Recent admin orders — kept for backward compat, but the dashboard now
      // reads `unifiedRecentOrders` below which spans all three order tables.
      safe('adminOrder.recent', prisma.adminOrder.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { client: true },
      }), []),

      // Custom orders grouped by status
      safe('customOrder.groupBy', prisma.customOrder.groupBy({ by: ['status'], _count: true }), []),

      // Admin orders grouped by status
      safe('adminOrder.groupBy', prisma.adminOrder.groupBy({ by: ['status'], _count: true }), []),

      // Upcoming consultations (next 7 days)
      safe('adminConsultation.upcoming', prisma.adminConsultation.findMany({
        where: {
          scheduledDate: { gte: todayStart, lt: weekEnd },
          status: { not: 'cancelled' },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 8,
        include: { client: true },
      }), []),

      // Upcoming fittings (next 7 days)
      safe('fitting.upcoming', prisma.fitting.findMany({
        where: {
          scheduledDate: { gte: todayStart, lt: weekEnd },
          status: { not: 'cancelled' },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 8,
        include: { customOrder: { include: { client: true } } },
      }), []),

      // Top designers
      safe('partnerDesigner.top', prisma.partnerDesigner.findMany({
        where: { status: 'active' },
        orderBy: { completedOrders: 'desc' },
        take: 5,
      }), []),

      // Recent activity
      safe('orderActivity.recent', prisma.orderActivity.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { customOrder: true },
      }), []),

      // Overdue admin orders (dueDate is a string field, so fetch all with dueDate and filter)
      safe('adminOrder.overdue', prisma.adminOrder.findMany({
        where: {
          dueDate: { not: null },
          status: { notIn: ['Delivered', 'Cancelled'] },
        },
        include: { client: true },
      }), []),

      // Overdue custom orders
      safe('customOrder.overdue', prisma.customOrder.findMany({
        where: {
          deadline: { not: null },
          status: { notIn: ['delivered', 'cancelled'] },
        },
        include: { client: true },
      }), []),

      // Custom orders awaiting deposit
      safe('customOrder.awaitingDeposit', prisma.customOrder.count({ where: { status: 'quote_sent' } }), 0),

      // Rental stats
      safe('rentalOrder.total', prisma.rentalOrder.count(), 0),
      safe('rentalOrder.active', prisma.rentalOrder.count({ where: { status: { in: ['reserved', 'confirmed', 'picked_up', 'in_use'] } } }), 0),
      safe('rentalOrder.revenue', prisma.rentalOrder.aggregate({ _sum: { totalPaid: true } }), { _sum: { totalPaid: 0 } }),

      // Client stats
      safe('client.total', prisma.client.count(), 0),
      safe('client.vip', prisma.client.count({ where: { vipTier: { in: ['vip', 'vvip'] } } }), 0),
      safe('client.newThisMonth', prisma.client.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }), 0),

      // Consultation stats
      safe('adminConsultation.total', prisma.adminConsultation.count(), 0),
      safe('adminConsultation.scheduled', prisma.adminConsultation.count({ where: { status: 'scheduled' } }), 0),
      safe('adminConsultation.completed', prisma.adminConsultation.count({ where: { status: 'completed' } }), 0),

      // Fabric inventory
      safe('fabricInventory.total', prisma.fabricInventory.count(), 0),

      // Quote stats
      safe('quote.total', prisma.quote.count(), 0),
      safe('quote.pending', prisma.quote.count({ where: { status: { in: ['sent', 'viewed'] } } }), 0),
      safe('quote.accepted', prisma.quote.count({ where: { status: { in: ['accepted', 'converted'] } } }), 0),

      // Designer stats
      safe('partnerDesigner.total', prisma.partnerDesigner.count(), 0),
      safe('partnerDesigner.active', prisma.partnerDesigner.count({ where: { status: 'active' } }), 0),

      // Product stats
      safe('adminProduct.total', prisma.adminProduct.count(), 0),
      safe('adminProduct.published', prisma.adminProduct.count({ where: { isPublished: true } }), 0),
      safe('adminProduct.featured', prisma.adminProduct.count({ where: { isFeatured: true } }), 0),
    ]);

    // ─── Storefront orders (separate from studio/admin orders) ───────
    const storefrontActiveStatuses = ['scheduled', 'in_production', 'shipped'];
    const [
      storefrontUnfulfilled,
      storefrontInTransit,
      storefrontTotal,
      storefrontActive,
      storefrontRevenue,
      recentStorefrontOrders,
      recentCustomOrders,
    ] = await Promise.all([
      safe('order.unfulfilled', prisma.order.count({ where: { status: 'scheduled' } }), 0),
      safe('order.inTransit', prisma.order.count({ where: { status: 'shipped' } }), 0),
      safe('order.total', prisma.order.count(), 0),
      safe(
        'order.active',
        prisma.order.count({ where: { status: { in: storefrontActiveStatuses } } }),
        0,
      ),
      safe(
        'order.revenue',
        prisma.order.aggregate({
          _sum: { amount: true },
          where: { payment: { status: 'succeeded' } },
        }),
        { _sum: { amount: 0 } },
      ),
      safe(
        'order.recent',
        prisma.order.findMany({
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: {
            user: { select: { name: true, email: true } },
            product: { select: { name: true } },
          },
        }),
        [] as Array<{
          id: string;
          status: string;
          amount: number | null;
          updatedAt: Date;
          user?: { name: string | null; email: string | null } | null;
          product?: { name: string | null } | null;
        }>,
      ),
      safe(
        'customOrder.recent',
        prisma.customOrder.findMany({
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: { client: true },
        }),
        [] as Array<{
          id: string;
          orderId: string;
          status: string;
          finalPrice: number | null;
          estimatedPrice: number | null;
          updatedAt: Date;
          client?: { name: string | null } | null;
        }>,
      ),
    ]);

    // Filter low stock: quantity < minStock OR quantity < admin-configured threshold
    const lowStockFiltered = lowStockItems.filter(
      (f) => f.quantity < f.minStock || f.quantity < lowStockThreshold
    );

    // Build pipeline counts from both admin and custom orders
    const pipelineStages = [
      { label: 'Inquiry', adminStatuses: ['Inquiry'], customStatuses: ['inquiry_received', 'pending_assignment'] },
      { label: 'Consultation', adminStatuses: [], customStatuses: ['consultation_scheduled', 'consultation_completed', 'offered', 'assigned'] },
      { label: 'Measurements', adminStatuses: [], customStatuses: ['measurements_received'] },
      { label: 'Quote', adminStatuses: ['Awaiting Deposit'], customStatuses: ['quote_sent', 'deposit_paid'] },
      { label: 'Production', adminStatuses: ['Fabric Sourced', 'Cutting', 'Sewing'], customStatuses: ['fabric_assigned', 'in_production'] },
      { label: 'Fitting', adminStatuses: ['Fitting', 'Finishing'], customStatuses: ['fitting_scheduled', 'alteration_in_progress'] },
      { label: 'Delivery', adminStatuses: ['Ready', 'Delivered'], customStatuses: ['final_payment_pending', 'ready_for_delivery', 'delivered'] },
    ];

    const adminStatusMap: Record<string, number> = {};
    for (const s of adminOrdersByStatus) adminStatusMap[s.status] = s._count;

    const customStatusMap: Record<string, number> = {};
    for (const s of customOrdersByStatus) customStatusMap[s.status] = s._count;

    const pipeline = pipelineStages.map((stage) => {
      const adminCount = stage.adminStatuses.reduce((sum, s) => sum + (adminStatusMap[s] || 0), 0);
      const customCount = stage.customStatuses.reduce((sum, s) => sum + (customStatusMap[s] || 0), 0);
      return { label: stage.label, count: adminCount + customCount };
    });

    // Build alerts
    const alerts: { type: string; message: string; severity: 'warning' | 'info' | 'urgent' }[] = [];

    const todayStr = todayStart.toISOString().split('T')[0];

    // Orders past due
    const overdueAdmin = overdueAdminOrders.filter((o) => o.dueDate && o.dueDate < todayStr);
    if (overdueAdmin.length > 0) {
      alerts.push({
        type: 'overdue',
        message: `${overdueAdmin.length} order${overdueAdmin.length > 1 ? 's' : ''} past due date`,
        severity: 'urgent',
      });
    }

    const overdueCustom = overdueCustomOrders.filter((o) => o.deadline && o.deadline < todayStr);
    if (overdueCustom.length > 0) {
      alerts.push({
        type: 'overdue',
        message: `${overdueCustom.length} custom order${overdueCustom.length > 1 ? 's' : ''} past deadline`,
        severity: 'urgent',
      });
    }

    // Today's consultations
    if (todayConsultations > 0) {
      alerts.push({
        type: 'consultations',
        message: `${todayConsultations} consultation${todayConsultations > 1 ? 's' : ''} scheduled for today`,
        severity: 'info',
      });
    }

    // Awaiting deposit
    if (customAwaitingDeposit > 0) {
      alerts.push({
        type: 'deposit',
        message: `${customAwaitingDeposit} custom order${customAwaitingDeposit > 1 ? 's' : ''} waiting for deposit`,
        severity: 'warning',
      });
    }

    // Low stock
    if (lowStockFiltered.length > 0) {
      alerts.push({
        type: 'low_stock',
        message: `${lowStockFiltered.length} fabric${lowStockFiltered.length > 1 ? 's' : ''} running low on stock`,
        severity: 'warning',
      });
    }

    // Upcoming fittings this week
    if (upcomingFittings.length > 0) {
      alerts.push({
        type: 'fittings',
        message: `${upcomingFittings.length} fitting${upcomingFittings.length > 1 ? 's' : ''} scheduled this week`,
        severity: 'info',
      });
    }

    // Storefront orders awaiting fulfillment — highest priority for daily ops
    if (storefrontUnfulfilled > 0) {
      alerts.push({
        type: 'storefront_unfulfilled',
        message: `${storefrontUnfulfilled} paid storefront order${storefrontUnfulfilled > 1 ? 's' : ''} awaiting fulfillment`,
        severity: 'urgent',
      });
    }

    // Pending custom requests
    if (pendingCustomRequests > 0) {
      alerts.push({
        type: 'pending',
        message: `${pendingCustomRequests} new custom request${pendingCustomRequests > 1 ? 's' : ''} awaiting response`,
        severity: 'warning',
      });
    }

    // Total revenue spans all three order tables.
    const adminRevenueTotal = adminRevenue._sum.totalPaid || 0;
    const customRevenueTotal = customRevenue._sum.totalPaid || 0;
    const storefrontRevenueTotal = storefrontRevenue._sum.amount || 0;
    const totalRevenue = adminRevenueTotal + customRevenueTotal + storefrontRevenueTotal;

    // Unified recent-orders list: Storefront + Studio (AdminOrder) + Couture (CustomOrder).
    // Each row carries the type so the dashboard can colour-code and link correctly.
    type UnifiedRow = {
      id: string;
      ref: string;
      type: 'storefront' | 'studio' | 'custom';
      customer: string;
      summary: string;
      status: string;
      amount: number;
      updatedAt: string;
      href: string;
    };
    const unifiedRecentOrders: UnifiedRow[] = [
      ...recentStorefrontOrders.map((o) => ({
        id: o.id,
        ref: o.id.slice(-6).toUpperCase(),
        type: 'storefront' as const,
        customer: o.user?.name || o.user?.email || 'Guest',
        summary: o.product?.name || 'Storefront order',
        status: o.status,
        amount: o.amount || 0,
        updatedAt: o.updatedAt.toISOString(),
        href: `/admin/orders/storefront/${o.id}`,
      })),
      ...recentOrders.map((o) => ({
        id: o.id,
        ref: o.orderId,
        type: 'studio' as const,
        customer: o.client?.name || 'Walk-in',
        summary: o.item,
        status: o.status,
        amount: o.totalPaid || 0,
        updatedAt: o.updatedAt.toISOString(),
        href: `/admin/orders/${o.id}`,
      })),
      ...recentCustomOrders.map((o) => ({
        id: o.id,
        ref: o.orderId,
        type: 'custom' as const,
        customer: o.client?.name || 'Unknown',
        summary: 'Custom couture',
        status: o.status,
        amount: o.finalPrice || o.estimatedPrice || 0,
        updatedAt: o.updatedAt.toISOString(),
        href: `/admin/orders/custom/${o.id}`,
      })),
    ]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 8);

    // Build custom orders by status for display
    const customOrderStatusCounts: Record<string, number> = {};
    for (const s of customOrdersByStatus) {
      customOrderStatusCounts[s.status] = s._count;
    }

    return NextResponse.json({
      revenue: totalRevenue,
      revenueByType: {
        storefront: storefrontRevenueTotal,
        studio: adminRevenueTotal,
        custom: customRevenueTotal,
      },
      activeOrders: activeAdminOrders + activeCustomOrders + storefrontActive,
      activeOrdersByType: {
        storefront: storefrontActive,
        studio: activeAdminOrders,
        custom: activeCustomOrders,
      },
      pendingCustom: pendingCustomRequests,
      todayConsultations,
      lowStockCount: lowStockFiltered.length,
      // Analytics-friendly aggregated stats
      orders: {
        total: activeAdminOrders + activeCustomOrders + storefrontActive,
        pending: activeAdminOrders,
        completed: (adminOrdersByStatus.find((s) => s.status === 'Delivered')?._count || 0) + (customOrdersByStatus.find((s) => s.status === 'delivered')?._count || 0),
        revenue: totalRevenue,
      },
      customOrders: {
        total: customOrdersByStatus.reduce((s, x) => s + x._count, 0),
        inProduction: (customStatusMap['in_production'] || 0) + (customStatusMap['fabric_assigned'] || 0),
        pipeline: customOrderStatusCounts,
      },
      rentals: {
        total: rentalTotal,
        active: rentalActive,
        revenue: rentalRevenue._sum.totalPaid || 0,
      },
      clients: {
        total: clientTotal,
        vip: clientVip,
        newThisMonth: clientNewThisMonth,
      },
      consultations: {
        total: consultTotal,
        scheduled: consultScheduled,
        completed: consultCompleted,
      },
      inventory: {
        totalFabrics: fabricTotal,
        lowStock: lowStockFiltered.length,
      },
      quotes: {
        total: quoteTotal,
        pending: quotePending,
        accepted: quoteAccepted,
        conversionRate: quoteTotal > 0 ? Math.round((quoteAccepted / quoteTotal) * 100) : 0,
      },
      designers: {
        total: designerTotal,
        active: designerActive,
        avgLoad: topDesigners.length > 0 ? Math.round(topDesigners.reduce((s, d) => s + (d.maxCapacity > 0 ? (d.currentLoad / d.maxCapacity) * 100 : 0), 0) / topDesigners.length) : 0,
      },
      products: {
        total: productTotal,
        published: productPublished,
        featured: productFeatured,
      },
      storefront: {
        total: storefrontTotal,
        active: storefrontActive,
        unfulfilled: storefrontUnfulfilled,
        inTransit: storefrontInTransit,
        revenue: storefrontRevenueTotal,
      },
      recentOrders: unifiedRecentOrders,
      recentAdminOrders: recentOrders,
      customOrdersByStatus: customOrderStatusCounts,
      pipeline,
      upcomingConsultations: upcomingConsultations.map((c) => ({
        id: c.id,
        consultId: c.consultId,
        clientName: c.client?.name || c.clientName || 'Walk-in',
        type: c.type,
        purpose: c.purpose,
        scheduledDate: c.scheduledDate,
        scheduledTime: c.scheduledTime,
        status: c.status,
      })),
      upcomingFittings: upcomingFittings.map((f) => ({
        id: f.id,
        clientName: f.customOrder?.client?.name || 'Unknown',
        orderId: f.customOrder?.orderId || null,
        type: f.type,
        scheduledDate: f.scheduledDate,
        scheduledTime: f.scheduledTime,
        status: f.status,
      })),
      topDesigners: topDesigners.map((d) => ({
        id: d.id,
        designerId: d.designerId,
        name: d.name,
        specialty: d.specialty,
        currentLoad: d.currentLoad,
        maxCapacity: d.maxCapacity,
        rating: d.rating,
        completedOrders: d.completedOrders,
        status: d.status,
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        description: a.description,
        orderId: a.customOrder?.orderId || null,
        performedBy: a.performedBy,
        createdAt: a.createdAt,
      })),
      alerts,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
