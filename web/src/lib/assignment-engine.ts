import prisma from '@/lib/prisma';

// ─── Constants ────────────────────────────────────────────────────

const OFFER_TIMEOUT_SECONDS = 60;
const MAX_OFFER_ROUNDS = 5;

// ─── Types ────────────────────────────────────────────────────────

interface CandidateDesigner {
  id: string;
  designerId: string;
  name: string;
  location: string | null;
  specialty: string | null;
  rating: number;
  currentLoad: number;
  maxCapacity: number;
  acceptanceRate: number;
  onTimeRate: number;
  lastAssignedAt: Date | null;
  score: number;
}

// ─── Generate Offer ID ───────────────────────────────────────────

async function generateOfferId(): Promise<string> {
  const lastOffer = await prisma.assignmentOffer.findFirst({
    orderBy: { offerId: 'desc' },
  });
  const nextNum = lastOffer
    ? parseInt(lastOffer.offerId.replace('OFR-', '')) + 1
    : 1;
  return `OFR-${String(nextNum).padStart(3, '0')}`;
}

// ─── Build Candidate List ────────────────────────────────────────

export async function buildCandidateList(
  orderId: string
): Promise<CandidateDesigner[]> {
  const order = await prisma.customOrder.findUnique({
    where: { id: orderId },
    include: { client: true, assignmentOffers: true },
  });

  if (!order) throw new Error('Order not found');

  // Get IDs of designers already offered for this order
  const alreadyOfferedIds = order.assignmentOffers.map((o) => o.designerId);

  // Get designers who already have an active offer from ANY order (prevent offer avalanche)
  const designersWithActiveOffers = await prisma.assignmentOffer.findMany({
    where: {
      status: 'offered',
      expiresAt: { gt: new Date() },
    },
    select: { designerId: true },
  });
  const busyDesignerIds = new Set(designersWithActiveOffers.map((o) => o.designerId));

  // Hard filters: active, has linked User account, not already offered, not busy
  const designers = await prisma.partnerDesigner.findMany({
    where: {
      status: 'active',
      userId: { not: null }, // Gap 2: must have linked User to receive offers
      id: { notIn: alreadyOfferedIds },
    },
  });

  const candidates: CandidateDesigner[] = [];

  for (const d of designers) {
    // Skip if over capacity
    if (d.currentLoad >= d.maxCapacity) continue;

    // Gap 9: skip designers who already have an active offer from another order
    if (busyDesignerIds.has(d.id)) continue;

    // Specialty match: if order has eventType, prefer matching specialty
    const specialtyMatch = !order.eventType || !d.specialty
      ? true
      : d.specialty.toLowerCase().includes(order.eventType.toLowerCase()) ||
        d.specialty.toLowerCase() === 'all';

    // Location match (city-level string match for MVP)
    const clientCity = order.client?.city?.toLowerCase() || '';
    const designerCity = d.location?.toLowerCase() || '';
    const locationMatch = clientCity && designerCity
      ? designerCity.includes(clientCity) || clientCity.includes(designerCity)
      : true;

    // Distance penalty (city-level: 0 if match, 2 if no match — proxy for distanceKm * 0.2)
    const distancePenalty = locationMatch ? 0 : 2;

    // Fairness penalty: recently assigned designers get a penalty
    let fairnessPenalty = 0;
    if (d.lastAssignedAt) {
      const hoursSinceAssigned =
        (Date.now() - new Date(d.lastAssignedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceAssigned < 24) {
        fairnessPenalty = 3 * (1 - hoursSinceAssigned / 24);
      }
    }

    // Gap 5: Scoring formula aligned with spec
    // score = (rating * 3) + (onTimeRate * 2) + (acceptanceRate * 2) - distancePenalty - (activeOrders * 0.5)
    // onTimeRate/acceptanceRate are 0-1 fractions, scaled to 0-100 for weighting
    const score =
      d.rating * 3 +
      (d.onTimeRate * 100) * 0.02 +    // effectively onTimeRate * 2
      (d.acceptanceRate * 100) * 0.02 + // effectively acceptanceRate * 2
      (specialtyMatch ? 1 : 0) -        // small bonus for specialty match
      distancePenalty -
      d.currentLoad * 0.5 -
      fairnessPenalty;

    candidates.push({
      id: d.id,
      designerId: d.designerId,
      name: d.name,
      location: d.location,
      specialty: d.specialty,
      rating: d.rating,
      currentLoad: d.currentLoad,
      maxCapacity: d.maxCapacity,
      acceptanceRate: d.acceptanceRate,
      onTimeRate: d.onTimeRate,
      lastAssignedAt: d.lastAssignedAt,
      score,
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

// ─── Create and Send Offer ───────────────────────────────────────

export async function createOffer(
  orderId: string,
  designerId: string
): Promise<{ offer: any; error?: string }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Verify order status allows offering
      const order = await tx.customOrder.findUnique({
        where: { id: orderId },
      });

      if (!order) throw new Error('Order not found');
      if (
        order.status !== 'pending_assignment' &&
        order.status !== 'offered'
      ) {
        throw new Error(
          `Order status "${order.status}" does not allow assignment`
        );
      }

      // Check max rounds
      if (order.assignmentAttempts >= MAX_OFFER_ROUNDS) {
        throw new Error('Maximum offer rounds reached');
      }

      // Verify no active (non-expired) offer exists for this order
      const activeOffer = await tx.assignmentOffer.findFirst({
        where: {
          customOrderId: orderId,
          status: 'offered',
          expiresAt: { gt: new Date() },
        },
      });

      if (activeOffer) {
        throw new Error('An active offer already exists for this order');
      }

      // Verify designer is eligible
      const designer = await tx.partnerDesigner.findUnique({
        where: { id: designerId },
      });

      if (!designer) throw new Error('Designer not found');
      if (designer.status !== 'active')
        throw new Error('Designer is not active');
      if (designer.currentLoad >= designer.maxCapacity)
        throw new Error('Designer is at capacity');

      // Generate offer ID
      const offerId = await generateOfferId();
      const expiresAt = new Date(
        Date.now() + OFFER_TIMEOUT_SECONDS * 1000
      );

      // Create the offer
      const offer = await tx.assignmentOffer.create({
        data: {
          offerId,
          customOrderId: orderId,
          designerId,
          status: 'offered',
          expiresAt,
        },
      });

      // Update order status and increment attempts
      await tx.customOrder.update({
        where: { id: orderId },
        data: {
          status: 'offered',
          assignmentAttempts: { increment: 1 },
        },
      });

      // Update designer stats
      await tx.partnerDesigner.update({
        where: { id: designerId },
        data: {
          totalOffered: { increment: 1 },
        },
      });

      // Log activity
      await tx.orderActivity.create({
        data: {
          customOrderId: orderId,
          action: 'designer_assigned',
          description: `Offer sent to designer ${designer.name} (${designer.designerId})`,
          newValue: `offered:${designer.designerId}`,
          performedBy: 'system',
        },
      });

      // Create notification for designer (if linked to a User)
      if (designer.userId) {
        await tx.notification.create({
          data: {
            userId: designer.userId,
            type: 'designer_offer',
            title: 'New Order Offer',
            message: `You have a new order offer. You have ${OFFER_TIMEOUT_SECONDS} seconds to respond.`,
            relatedId: offer.id,
          },
        });
      }

      return offer;
    });

    return { offer: result };
  } catch (error: any) {
    return { offer: null, error: error.message };
  }
}

// ─── Respond to Offer ────────────────────────────────────────────

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline',
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const offer = await tx.assignmentOffer.findUnique({
        where: { id: offerId },
        include: { designer: true, customOrder: { include: { client: true } } },
      });

      if (!offer) throw new Error('Offer not found');
      if (offer.status !== 'offered') throw new Error('Offer is no longer available');
      if (new Date(offer.expiresAt) <= new Date()) throw new Error('Offer has expired');
      if (offer.customOrder.status !== 'offered')
        throw new Error('Order is no longer available for assignment');

      if (action === 'accept') {
        // Accept the offer
        await tx.assignmentOffer.update({
          where: { id: offerId },
          data: { status: 'accepted', respondedAt: new Date() },
        });

        // Assign the order
        await tx.customOrder.update({
          where: { id: offer.customOrderId },
          data: {
            status: 'assigned',
            designerId: offer.designerId,
          },
        });

        // Update designer stats
        await tx.partnerDesigner.update({
          where: { id: offer.designerId },
          data: {
            currentLoad: { increment: 1 },
            totalAccepted: { increment: 1 },
            lastAssignedAt: new Date(),
            acceptanceRate: offer.designer.totalOffered > 0
              ? (offer.designer.totalAccepted + 1) / offer.designer.totalOffered
              : 1.0,
          },
        });

        // Cancel any other pending offers for this order
        await tx.assignmentOffer.updateMany({
          where: {
            customOrderId: offer.customOrderId,
            id: { not: offerId },
            status: 'offered',
          },
          data: { status: 'expired' },
        });

        // Log activity
        await tx.orderActivity.create({
          data: {
            customOrderId: offer.customOrderId,
            action: 'designer_assigned',
            description: `Designer ${offer.designer.name} accepted the order`,
            previousValue: 'offered',
            newValue: `assigned:${offer.designer.designerId}`,
            performedBy: offer.designer.designerId,
          },
        });

        // Notify admin (founder role users)
        const admins = await tx.user.findMany({
          where: { role: { in: ['founder', 'staff'] } },
        });
        for (const admin of admins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              type: 'order_assigned',
              title: 'Order Assigned',
              message: `${offer.designer.name} accepted order ${offer.customOrder.orderId}`,
              relatedId: offer.customOrderId,
            },
          });
        }
      } else {
        // Decline the offer
        await tx.assignmentOffer.update({
          where: { id: offerId },
          data: {
            status: 'declined',
            respondedAt: new Date(),
            declineReason: reason || null,
          },
        });

        // Log activity
        await tx.orderActivity.create({
          data: {
            customOrderId: offer.customOrderId,
            action: 'status_change',
            description: `Designer ${offer.designer.name} declined the offer${reason ? `: ${reason}` : ''}`,
            previousValue: `offered:${offer.designer.designerId}`,
            newValue: 'declined',
            performedBy: offer.designer.designerId,
          },
        });
      }
    });

    // If declined, offer to next candidate (outside the main transaction)
    if (action === 'decline') {
      const offer = await prisma.assignmentOffer.findUnique({
        where: { id: offerId },
      });
      if (offer) {
        await offerNextCandidate(offer.customOrderId);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Expire Stale Offers (lazy evaluation) ───────────────────────

export async function expireStaleOffers(): Promise<number> {
  const staleOffers = await prisma.assignmentOffer.findMany({
    where: {
      status: 'offered',
      expiresAt: { lte: new Date() },
    },
  });

  for (const offer of staleOffers) {
    await prisma.assignmentOffer.update({
      where: { id: offer.id },
      data: { status: 'expired' },
    });

    await prisma.orderActivity.create({
      data: {
        customOrderId: offer.customOrderId,
        action: 'status_change',
        description: 'Offer expired (no response)',
        previousValue: `offered:${offer.designerId}`,
        newValue: 'expired',
        performedBy: 'system',
      },
    });

    // Offer to next candidate
    await offerNextCandidate(offer.customOrderId);
  }

  return staleOffers.length;
}

// ─── Offer Next Candidate ────────────────────────────────────────

export async function offerNextCandidate(
  orderId: string
): Promise<{ offered: boolean; error?: string }> {
  const order = await prisma.customOrder.findUnique({
    where: { id: orderId },
  });

  if (!order) return { offered: false, error: 'Order not found' };

  // If order is already assigned, don't offer
  if (order.status === 'assigned') {
    return { offered: false, error: 'Order already assigned' };
  }

  // Check max rounds
  if (order.assignmentAttempts >= MAX_OFFER_ROUNDS) {
    // Move to manual queue
    await prisma.customOrder.update({
      where: { id: orderId },
      data: { status: 'pending_assignment' },
    });

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: { in: ['founder', 'staff'] } },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'order_status_changed',
          title: 'Manual Assignment Needed',
          message: `No designers accepted order ${order.orderId}. Manual assignment required.`,
          relatedId: orderId,
        },
      });
    }

    return { offered: false, error: 'Max offer rounds reached, moved to manual queue' };
  }

  // Build fresh candidate list (excludes already-offered designers)
  const candidates = await buildCandidateList(orderId);

  if (candidates.length === 0) {
    // No candidates available
    await prisma.customOrder.update({
      where: { id: orderId },
      data: { status: 'pending_assignment' },
    });

    const admins = await prisma.user.findMany({
      where: { role: { in: ['founder', 'staff'] } },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'order_status_changed',
          title: 'No Designers Available',
          message: `No eligible designers found for order ${order.orderId}. Manual assignment required.`,
          relatedId: orderId,
        },
      });
    }

    return { offered: false, error: 'No eligible candidates available' };
  }

  // Offer to the top candidate
  const result = await createOffer(orderId, candidates[0].id);
  return { offered: !!result.offer, error: result.error };
}

// ─── Trigger Assignment Flow ─────────────────────────────────────

export async function triggerAssignment(
  orderId: string
): Promise<{
  success: boolean;
  candidates: CandidateDesigner[];
  offer?: any;
  error?: string;
}> {
  // Set order to pending_assignment first
  const order = await prisma.customOrder.findUnique({
    where: { id: orderId },
  });

  if (!order) return { success: false, candidates: [], error: 'Order not found' };

  // Allow triggering from various statuses
  const allowedStatuses = [
    'inquiry_received',
    'pending_assignment',
    'consultation_completed',
    'measurements_received',
    'deposit_paid',
  ];

  if (!allowedStatuses.includes(order.status)) {
    return {
      success: false,
      candidates: [],
      error: `Cannot assign from status "${order.status}"`,
    };
  }

  // Reset attempts if re-triggering
  await prisma.customOrder.update({
    where: { id: orderId },
    data: {
      status: 'pending_assignment',
      assignmentAttempts: 0,
    },
  });

  // Build candidates
  const candidates = await buildCandidateList(orderId);

  if (candidates.length === 0) {
    return {
      success: false,
      candidates: [],
      error: 'No eligible designers found',
    };
  }

  // Send first offer
  const result = await createOffer(orderId, candidates[0].id);

  return {
    success: !!result.offer,
    candidates,
    offer: result.offer,
    error: result.error,
  };
}

// ─── Manual Assignment ───────────────────────────────────────────

export async function manualAssign(
  orderId: string,
  designerId: string,
  performedBy?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.customOrder.findUnique({
        where: { id: orderId },
      });
      if (!order) throw new Error('Order not found');

      const designer = await tx.partnerDesigner.findUnique({
        where: { id: designerId },
      });
      if (!designer) throw new Error('Designer not found');

      // Cancel any active offers
      await tx.assignmentOffer.updateMany({
        where: {
          customOrderId: orderId,
          status: 'offered',
        },
        data: { status: 'expired' },
      });

      // Assign
      await tx.customOrder.update({
        where: { id: orderId },
        data: {
          status: 'assigned',
          designerId: designer.id,
        },
      });

      // Update designer
      await tx.partnerDesigner.update({
        where: { id: designerId },
        data: {
          currentLoad: { increment: 1 },
          lastAssignedAt: new Date(),
        },
      });

      // Log activity
      await tx.orderActivity.create({
        data: {
          customOrderId: orderId,
          action: 'designer_assigned',
          description: `Manually assigned to ${designer.name} (${designer.designerId})`,
          previousValue: order.status,
          newValue: `assigned:${designer.designerId}`,
          performedBy: performedBy || 'admin',
        },
      });
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Complete Order (decrement load, update stats) ───────────────

export async function completeOrder(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.customOrder.findUnique({
        where: { id: orderId },
      });

      if (!order) throw new Error('Order not found');
      if (!order.designerId) return; // No designer assigned

      const designer = await tx.partnerDesigner.findUnique({
        where: { id: order.designerId },
      });

      if (!designer) return;

      // Check if order was delivered on time
      let wasOnTime = true;
      if (order.deadline) {
        const deadlineDate = new Date(order.deadline);
        wasOnTime = new Date() <= deadlineDate;
      }

      // Recalculate onTimeRate
      const totalCompleted = designer.completedOrders + 1;
      const previousOnTimeCount = Math.round(designer.onTimeRate * designer.completedOrders);
      const newOnTimeCount = previousOnTimeCount + (wasOnTime ? 1 : 0);
      const newOnTimeRate = totalCompleted > 0 ? newOnTimeCount / totalCompleted : 1.0;

      // Update designer stats
      await tx.partnerDesigner.update({
        where: { id: designer.id },
        data: {
          currentLoad: Math.max(0, designer.currentLoad - 1),
          completedOrders: { increment: 1 },
          onTimeRate: Math.round(newOnTimeRate * 100) / 100,
        },
      });

      // Log activity
      await tx.orderActivity.create({
        data: {
          customOrderId: orderId,
          action: 'status_change',
          description: `Order completed. Designer ${designer.name} stats updated (on-time: ${wasOnTime ? 'yes' : 'no'}).`,
          performedBy: 'system',
        },
      });
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
