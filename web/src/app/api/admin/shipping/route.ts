import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRates, createShipment, trackShipment, validateAddress, isUPSConfigured } from '@/lib/ups';
import { createShipment as createUspsShipment, trackShipment as trackUspsShipment, isUSPSConfigured, isUSPSReadyForLabels, isUSPSDirectLabelsReady, validateAddress as validateUspsAddress } from '@/lib/usps';
import { isEasyPostConfigured } from '@/lib/easypost';
import type { USPSServiceCode } from '@/lib/usps';
import { updateShipmentStatus } from '@/lib/shipping-notifications';
import type { ShipToAddress, PackageDetails, UPSServiceCode } from '@/lib/ups';
import { requireAdmin } from '@/lib/auth-guard';
import { advanceStorefrontOrderForShipment, storefrontOrderIdFromShipment, createShipmentRow } from '@/lib/auto-shipping';
import { refundLabel } from '@/lib/easypost';

type CarrierCode = 'UPS' | 'USPS';

function normalizeCarrier(c: unknown): CarrierCode {
  return String(c || '').toUpperCase() === 'USPS' ? 'USPS' : 'UPS';
}

// ─── GET: List all shipments (with filters) ───────────────────────

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const carrier = searchParams.get('carrier');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (carrier && carrier !== 'all') where.carrier = carrier;
    if (search) {
      where.OR = [
        { shipmentId: { contains: search } },
        { trackingNumber: { contains: search } },
        { recipientName: { contains: search } },
      ];
    }

    const shipments = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // ─── Hydrate each shipment with a human-readable item label ────
    // The Shipment row itself doesn't store what is being shipped — it
    // only carries FK pointers to the various order tables. Resolve the
    // linked order in a single batched lookup per type so the admin
    // shipping table can render a Product/Item column.
    const adminIds = [...new Set(shipments.map((s) => s.adminOrderId).filter(Boolean) as string[])];
    const customIds = [...new Set(shipments.map((s) => s.customOrderId).filter(Boolean) as string[])];
    const rentalIds = [...new Set(shipments.map((s) => s.rentalOrderId).filter(Boolean) as string[])];
    // Resolve the storefront order via the FK OR the note prefix — auto-shipping
    // historically linked only via the note, so FK-only lookup showed those as
    // "No linked order".
    const storefrontIds = [...new Set(shipments.map((s) => storefrontOrderIdFromShipment(s)).filter(Boolean) as string[])];

    const [adminOrders, customOrders, rentalOrders, storefrontOrders] = await Promise.all([
      adminIds.length
        ? prisma.adminOrder.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, orderId: true, item: true, fabric: true },
          })
        : Promise.resolve([]),
      customIds.length
        ? prisma.customOrder.findMany({
            where: { id: { in: customIds } },
            select: { id: true, orderId: true, eventType: true, designDescription: true },
          })
        : Promise.resolve([]),
      rentalIds.length
        ? prisma.rentalOrder.findMany({
            where: { id: { in: rentalIds } },
            select: { id: true, rentalId: true, rentalItem: { select: { name: true } } },
          })
        : Promise.resolve([]),
      storefrontIds.length
        ? prisma.order.findMany({
            where: { id: { in: storefrontIds } },
            select: { id: true, product: { select: { name: true, image: true } } },
          })
        : Promise.resolve([]),
    ]);

    const adminMap = new Map(adminOrders.map((o) => [o.id, o]));
    const customMap = new Map(customOrders.map((o) => [o.id, o]));
    const rentalMap = new Map(rentalOrders.map((o) => [o.id, o]));
    const storefrontMap = new Map(storefrontOrders.map((o) => [o.id, o]));

    const hydrated = shipments.map((s) => {
      let itemLabel = '';
      let itemImage: string | null = null;
      let linkedOrderRef = '';
      if (s.adminOrderId && adminMap.has(s.adminOrderId)) {
        const o = adminMap.get(s.adminOrderId)!;
        itemLabel = [o.item, o.fabric].filter(Boolean).join(' • ');
        linkedOrderRef = o.orderId;
      } else if (s.customOrderId && customMap.has(s.customOrderId)) {
        const o = customMap.get(s.customOrderId)!;
        itemLabel = [o.eventType, o.designDescription].filter(Boolean).join(' • ') || 'Custom order';
        linkedOrderRef = o.orderId;
      } else if (s.rentalOrderId && rentalMap.has(s.rentalOrderId)) {
        const o = rentalMap.get(s.rentalOrderId)!;
        itemLabel = o.rentalItem?.name || 'Rental item';
        linkedOrderRef = o.rentalId;
      } else {
        const sfId = storefrontOrderIdFromShipment(s);
        if (sfId && storefrontMap.has(sfId)) {
          const o = storefrontMap.get(sfId)!;
          itemLabel = o.product?.name || 'Storefront order';
          itemImage = o.product?.image || null;
          linkedOrderRef = `SO-${sfId.slice(-6).toUpperCase()}`;
        }
      }
      return { ...s, itemLabel, itemImage, linkedOrderRef };
    });

    const stats = {
      total: await prisma.shipment.count(),
      pending: await prisma.shipment.count({ where: { status: 'pending' } }),
      labelCreated: await prisma.shipment.count({ where: { status: 'label_created' } }),
      inTransit: await prisma.shipment.count({ where: { status: 'in_transit' } }),
      delivered: await prisma.shipment.count({ where: { status: 'delivered' } }),
      upsConfigured: isUPSConfigured(),
      uspsConfigured: isUSPSConfigured(),
      uspsLabelsReady: isUSPSReadyForLabels(),
      easyPostReady: isEasyPostConfigured(),
      // Which provider will actually buy labels: direct USPS is preferred once
      // its scope lands; otherwise EasyPost; otherwise none.
      labelProvider: isUSPSDirectLabelsReady() ? 'USPS (direct)' : isEasyPostConfigured() ? 'EasyPost' : 'none',
    };

    return NextResponse.json({ shipments: hydrated, stats });
  } catch (error) {
    console.error('Shipping GET error:', error);
    return NextResponse.json({ error: 'Failed to load shipments' }, { status: 500 });
  }
}

// ─── POST: Create shipment, get rates, create label, or track ─────

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'get_rates': {
        const { shipTo, packageDetails } = body as {
          shipTo: ShipToAddress;
          packageDetails: PackageDetails;
        };
        const rates = await getRates(shipTo, packageDetails);
        return NextResponse.json({ rates });
      }

      case 'validate_address': {
        const { address, carrier: carrierRaw } = body as { address: ShipToAddress; carrier?: string };
        const carrier = normalizeCarrier(carrierRaw);
        const result = carrier === 'USPS'
          ? await validateUspsAddress(address)
          : await validateAddress(address);
        return NextResponse.json(result);
      }

      case 'void_label': {
        // Cancel a purchased label: submit a refund to the carrier (USPS via
        // EasyPost — async, returns "submitted"), remove the shipment, and roll
        // the linked storefront order back to "scheduled" so a new label can be
        // bought from the order page. Refused once the parcel is moving.
        const { shipmentId: voidId } = body as { shipmentId: string };
        if (!voidId) {
          return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
        }
        const sh = await prisma.shipment.findUnique({ where: { id: voidId } });
        if (!sh) {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }
        if (['in_transit', 'out_for_delivery', 'delivered'].includes(sh.status)) {
          return NextResponse.json(
            { error: `Cannot void a shipment that is already "${sh.status}".` },
            { status: 400 },
          );
        }

        let refund: Awaited<ReturnType<typeof refundLabel>> | null = null;
        if (sh.trackingNumber) {
          refund = await refundLabel(sh.trackingNumber, sh.carrier || 'USPS');
        }

        const linkedOrderId = storefrontOrderIdFromShipment(sh);
        await prisma.shipmentEvent.deleteMany({ where: { shipmentId: sh.id } });
        await prisma.shipment.delete({ where: { id: sh.id } });
        if (linkedOrderId) {
          await prisma.order
            .updateMany({ where: { id: linkedOrderId, status: 'processing' }, data: { status: 'scheduled' } })
            .catch(() => {});
        }

        return NextResponse.json({ ok: true, refund });
      }

      case 'create_label': {
        const {
          shipTo,
          packageDetails,
          serviceCode,
          orderId,
          orderType,
          description,
          carrier: carrierRaw,
        } = body as {
          shipTo: ShipToAddress;
          packageDetails: PackageDetails;
          serviceCode: UPSServiceCode | USPSServiceCode;
          orderId?: string;
          orderType?: 'admin' | 'custom' | 'rental' | 'storefront';
          description?: string;
          carrier?: string;
        };
        const carrier = normalizeCarrier(carrierRaw);

        const result = carrier === 'USPS'
          ? await createUspsShipment(shipTo, packageDetails, serviceCode as USPSServiceCode, description)
          : await createShipment(shipTo, packageDetails, serviceCode as UPSServiceCode, description);

        // Store in DB with a collision-proof shipment id (shared generator).
        const shipment = await createShipmentRow({
            adminOrderId: orderType === 'admin' ? orderId : null,
            customOrderId: orderType === 'custom' ? orderId : null,
            rentalOrderId: orderType === 'rental' ? orderId : null,
            storefrontOrderId: orderType === 'storefront' ? orderId : null,
            recipientName: shipTo.name,
            recipientPhone: shipTo.phone || null,
            recipientEmail: null,
            addressLine1: shipTo.addressLine1,
            addressLine2: shipTo.addressLine2 || null,
            city: shipTo.city,
            state: shipTo.state,
            postalCode: shipTo.postalCode,
            country: shipTo.country,
            carrier,
            serviceType: serviceCode,
            trackingNumber: result.trackingNumber,
            labelUrl: null,
            labelData: result.labelImageBase64 || null,
            packageWeight: packageDetails.weight,
            packageLength: packageDetails.length,
            packageWidth: packageDetails.width,
            packageHeight: packageDetails.height,
            declaredValue: packageDetails.declaredValue || null,
            shippingCost: result.totalCharge,
            insuranceCost: null,
            status: 'label_created',
            shippedAt: new Date(),
        });

        // Keep order status consistent with auto-shipping: a paid order moves
        // to "processing" once its label exists.
        await advanceStorefrontOrderForShipment(shipment);

        return NextResponse.json({ shipment, trackingNumber: result.trackingNumber, labelData: result.labelImageBase64 });
      }

      case 'track': {
        const { trackingNumber, carrier: carrierRaw } = body as { trackingNumber: string; carrier?: string };

        // Find the shipment first so we know which carrier to query.
        const existing = await prisma.shipment.findFirst({ where: { trackingNumber } });
        const carrier = normalizeCarrier(carrierRaw || existing?.carrier);

        const tracking = carrier === 'USPS'
          ? await trackUspsShipment(trackingNumber)
          : await trackShipment(trackingNumber);

        // Map carrier-specific status codes to our internal vocabulary.
        const upsMap: Record<string, string> = { D: 'delivered', I: 'in_transit', P: 'picked_up', M: 'in_transit', X: 'exception' };
        const uspsMap: Record<string, string> = {
          DELIVERED: 'delivered',
          OUT_FOR_DELIVERY: 'out_for_delivery',
          IN_TRANSIT: 'in_transit',
          ACCEPTED: 'picked_up',
          PRE_SHIPMENT: 'label_created',
          DELIVERY_EXCEPTION: 'exception',
        };
        const statusMap = carrier === 'USPS' ? uspsMap : upsMap;
        const mapped = statusMap[String(tracking.status).toUpperCase()];

        if (tracking.trackingNumber && existing) {
          // Persist estimated/actual delivery from the carrier response.
          await prisma.shipment.update({
            where: { id: existing.id },
            data: {
              ...(tracking.estimatedDelivery && { estimatedDelivery: new Date(tracking.estimatedDelivery) }),
              ...(tracking.actualDelivery && { actualDelivery: new Date(tracking.actualDelivery) }),
            },
          });

          // Route status changes through updateShipmentStatus so the linked
          // storefront order flips (processing → shipped → delivered), a
          // ShipmentEvent row is recorded, and customer email + in-app
          // notification fire — same path the EasyPost webhook + cron use.
          if (mapped && mapped !== existing.status) {
            await updateShipmentStatus(existing.id, mapped, {
              description: `Status from ${carrier} tracking lookup`,
              source: 'admin_track_lookup',
            });
          }
        }

        return NextResponse.json({ tracking });
      }

      case 'create_shipment': {
        // Manual shipment creation (non-UPS carriers)
        const {
          recipientName,
          recipientPhone,
          recipientEmail,
          addressLine1,
          addressLine2,
          city,
          state,
          postalCode,
          country,
          carrier,
          serviceType,
          trackingNumber,
          packageWeight,
          packageLength,
          packageWidth,
          packageHeight,
          declaredValue,
          shippingCost,
          orderId: manualOrderId,
          orderType: manualOrderType,
          notes,
        } = body;

        const shipment = await createShipmentRow({
            adminOrderId: manualOrderType === 'admin' ? manualOrderId : null,
            customOrderId: manualOrderType === 'custom' ? manualOrderId : null,
            rentalOrderId: manualOrderType === 'rental' ? manualOrderId : null,
            storefrontOrderId: manualOrderType === 'storefront' ? manualOrderId : null,
            recipientName,
            recipientPhone: recipientPhone || null,
            recipientEmail: recipientEmail || null,
            addressLine1,
            addressLine2: addressLine2 || null,
            city,
            state,
            postalCode,
            country: country || 'US',
            carrier: carrier || 'UPS',
            serviceType: serviceType || null,
            trackingNumber: trackingNumber || null,
            packageWeight: packageWeight || null,
            packageLength: packageLength || null,
            packageWidth: packageWidth || null,
            packageHeight: packageHeight || null,
            declaredValue: declaredValue || null,
            shippingCost: shippingCost || null,
            status: trackingNumber ? 'label_created' : 'pending',
            notes: notes || null,
        });

        return NextResponse.json({ shipment });
      }

      case 'manual_label': {
        // Record a label that was paid for and generated OUTSIDE the app
        // (e.g. usps.com Click-N-Ship, a UPS Store, pirateship.com) while we
        // wait for USPS EPS approval or full UPS configuration. The admin
        // enters the tracking number, what they paid, optionally pastes a
        // base64-encoded PDF/PNG of the label, and we flip the shipment to
        // `label_created` so the rest of the workflow keeps working.
        const {
          shipmentId: idArg,
          trackingNumber: manualTracking,
          carrier: manualCarrierRaw,
          serviceType: manualServiceType,
          shippingCost: manualCost,
          labelData: manualLabelData,
          labelUrl: manualLabelUrl,
          notes: manualNotes,
        } = body as {
          shipmentId: string;
          trackingNumber: string;
          carrier?: string;
          serviceType?: string;
          shippingCost?: number | string;
          labelData?: string | null;
          labelUrl?: string | null;
          notes?: string;
        };

        if (!idArg) {
          return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
        }
        if (!manualTracking || !String(manualTracking).trim()) {
          return NextResponse.json({ error: 'trackingNumber is required' }, { status: 400 });
        }

        const existing = await prisma.shipment.findUnique({ where: { id: idArg } });
        if (!existing) {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }

        // Normalize: strip any data-URL prefix from a pasted/uploaded label so
        // labelData is pure base64 like the carrier-API path stores it.
        const cleanLabelData = typeof manualLabelData === 'string' && manualLabelData
          ? manualLabelData.replace(/^data:[^;]+;base64,/, '').trim() || null
          : null;

        // Coerce cost: accept number or numeric string, ignore empty/NaN.
        let costValue: number | null = null;
        if (manualCost !== undefined && manualCost !== null && manualCost !== '') {
          const n = typeof manualCost === 'number' ? manualCost : parseFloat(String(manualCost));
          if (Number.isFinite(n)) costValue = n;
        }

        const carrier = manualCarrierRaw
          ? String(manualCarrierRaw).toUpperCase()
          : existing.carrier;

        // Preserve any prior notes and append a clear audit trail line.
        const auditLine = `Label purchased manually${costValue !== null ? ` ($${costValue.toFixed(2)})` : ''} on ${new Date().toISOString().slice(0, 10)}`;
        const combinedNotes = [existing.notes, manualNotes, auditLine]
          .map((n) => (n ? String(n).trim() : ''))
          .filter(Boolean)
          .join('\n');

        const updated = await prisma.shipment.update({
          where: { id: existing.id },
          data: {
            carrier,
            ...(manualServiceType ? { serviceType: String(manualServiceType) } : {}),
            trackingNumber: String(manualTracking).trim(),
            ...(cleanLabelData !== null ? { labelData: cleanLabelData } : {}),
            ...(manualLabelUrl !== undefined ? { labelUrl: manualLabelUrl || null } : {}),
            ...(costValue !== null ? { shippingCost: costValue } : {}),
            status: 'label_created',
            shippedAt: existing.shippedAt || new Date(),
            notes: combinedNotes || existing.notes,
          },
        });

        await advanceStorefrontOrderForShipment(updated);

        return NextResponse.json({ shipment: updated });
      }

      case 'buy_label': {
        // Purchase a real carrier label for an existing pending shipment.
        const {
          shipmentId: idArg,
          serviceCode,
          carrier: carrierRaw,
          packageDetails: pkgOverride,
        } = body as {
          shipmentId: string;
          serviceCode?: string;
          carrier?: string;
          packageDetails?: PackageDetails;
        };

        if (!idArg) {
          return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
        }

        const existing = await prisma.shipment.findUnique({ where: { id: idArg } });
        if (!existing) {
          return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }

        const carrier = normalizeCarrier(carrierRaw || existing.carrier);

        // Fail fast with a friendly 400 when the carrier can't actually buy
        // postage yet, so the UI can show the message instead of an opaque 500.
        if (carrier === 'USPS' && !isUSPSReadyForLabels()) {
          return NextResponse.json(
            { error: 'USPS label-buying is not ready. Need USPS_CLIENT_ID, USPS_CLIENT_SECRET, USPS_CRID, USPS_MID, and USPS_PAYMENT_ACCOUNT (EPS) in Railway. Address validation, tracking, and rate quotes still work.' },
            { status: 400 }
          );
        }
        if (carrier === 'UPS' && !isUPSConfigured()) {
          return NextResponse.json(
            { error: 'UPS is not configured. Set the UPS_* environment variables in Railway, then redeploy.' },
            { status: 400 }
          );
        }

        const effectiveService = (serviceCode || existing.serviceType || (carrier === 'USPS' ? 'USPS_GROUND_ADVANTAGE' : '03')) as UPSServiceCode | USPSServiceCode;

        const shipTo: ShipToAddress = {
          name: existing.recipientName,
          phone: existing.recipientPhone || '',
          addressLine1: existing.addressLine1,
          addressLine2: existing.addressLine2 || '',
          city: existing.city,
          state: existing.state,
          postalCode: existing.postalCode,
          country: existing.country || 'US',
        };

        const packageDetails: PackageDetails = pkgOverride || {
          weight: existing.packageWeight || 2,
          length: existing.packageLength || 14,
          width: existing.packageWidth || 10,
          height: existing.packageHeight || 6,
          declaredValue: existing.declaredValue || undefined,
        };

        const result = carrier === 'USPS'
          ? await createUspsShipment(shipTo, packageDetails, effectiveService as USPSServiceCode, `AWULA K shipment ${existing.shipmentId}`)
          : await createShipment(shipTo, packageDetails, effectiveService as UPSServiceCode, `AWULA K shipment ${existing.shipmentId}`);

        const updated = await prisma.shipment.update({
          where: { id: existing.id },
          data: {
            carrier,
            serviceType: String(effectiveService),
            trackingNumber: result.trackingNumber,
            labelData: result.labelImageBase64 || existing.labelData,
            shippingCost: result.totalCharge,
            status: 'label_created',
            shippedAt: existing.shippedAt || new Date(),
          },
        });

        await advanceStorefrontOrderForShipment(updated);

        return NextResponse.json({ shipment: updated, trackingNumber: result.trackingNumber, labelData: result.labelImageBase64 });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Shipping POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Shipping operation failed' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update shipment status ────────────────────────────────

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Shipment ID required' }, { status: 400 });
    }

    // Use the notification-aware update if status is changing
    if (data.status) {
      const shipment = await updateShipmentStatus(id, data.status, {
        description: data.notes || `Status changed to ${data.status}`,
        source: 'admin',
      });

      // Also update other fields if provided
      if (data.trackingNumber !== undefined || data.notes !== undefined) {
        await prisma.shipment.update({
          where: { id },
          data: {
            ...(data.trackingNumber !== undefined && { trackingNumber: data.trackingNumber }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        });
      }

      return NextResponse.json({ shipment });
    }

    // Non-status updates
    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        ...(data.trackingNumber !== undefined && { trackingNumber: data.trackingNumber }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    return NextResponse.json({ shipment });
  } catch (error) {
    console.error('Shipping PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 });
  }
}

// ─── DELETE: Remove a shipment ────────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Shipment id required' }, { status: 400 });
    }

    const existing = await prisma.shipment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    // Refuse to delete shipments that are already moving through the network.
    const blocked = new Set(['in_transit', 'out_for_delivery', 'delivered']);
    if (blocked.has(existing.status)) {
      return NextResponse.json(
        { error: `Cannot delete a shipment in status "${existing.status}". Cancel/void the label with the carrier first.` },
        { status: 400 },
      );
    }

    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: existing.id } });
    await prisma.shipment.delete({ where: { id: existing.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Shipping DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete shipment' }, { status: 500 });
  }
}
