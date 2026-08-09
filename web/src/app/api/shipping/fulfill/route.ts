import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getRates, createShipment, type ShipToAddress, type PackageDetails, type UPSServiceCode } from '@/lib/ups';
import { updateShipmentStatus } from '@/lib/shipping-notifications';
import { createShipmentRow } from '@/lib/auto-shipping';

/**
 * POST /api/shipping/fulfill
 * Auto-creates a shipment when an order is ready.
 * Can be called from admin dashboard or triggered by order status change.
 *
 * Body:
 * - orderId: string (AdminOrder, CustomOrder, or RentalOrder ID)
 * - orderType: 'admin' | 'custom' | 'rental'
 * - autoLabel?: boolean (if true, also create UPS label immediately)
 * - serviceCode?: string (UPS service code, defaults to '03' Ground)
 * - packageDetails?: { weight, length, width, height, declaredValue }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { orderId, orderType, autoLabel, serviceCode, packageDetails: pkgOverride } = body;

    if (!orderId || !orderType) {
      return NextResponse.json({ error: 'orderId and orderType are required' }, { status: 400 });
    }

    // Fetch order + client address
    let recipientName = '';
    let recipientEmail: string | null = null;
    let recipientPhone: string | null = null;
    let address: ShipToAddress | null = null;

    if (orderType === 'admin') {
      const order = await prisma.adminOrder.findUnique({
        where: { id: orderId },
        include: { client: true },
      });
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

      recipientName = order.client?.name || '';
      recipientEmail = order.client?.email || null;
      recipientPhone = order.client?.phone || null;

      // Client may have city but address fields are provided in the request body
      if (order.client) {
        address = {
          name: recipientName,
          phone: recipientPhone || undefined,
          addressLine1: body.addressLine1 || '',
          city: order.client.city || body.city || '',
          state: body.state || '',
          postalCode: body.postalCode || '',
          country: body.country || 'US',
        };
      }
    } else if (orderType === 'custom') {
      const order = await prisma.customOrder.findUnique({
        where: { id: orderId },
        include: { client: true },
      });
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

      recipientName = order.client?.name || '';
      recipientEmail = order.client?.email || null;
    }

    // Check if a shipment already exists for this order
    const existingShipment = await prisma.shipment.findFirst({
      where: {
        OR: [
          { adminOrderId: orderType === 'admin' ? orderId : undefined },
          { customOrderId: orderType === 'custom' ? orderId : undefined },
          { rentalOrderId: orderType === 'rental' ? orderId : undefined },
        ].filter(c => Object.values(c).some(v => v !== undefined)),
      },
    });

    if (existingShipment) {
      return NextResponse.json({
        error: 'A shipment already exists for this order',
        shipment: existingShipment,
      }, { status: 409 });
    }

    if (!recipientName) {
      return NextResponse.json({ error: 'Could not determine recipient name from order' }, { status: 400 });
    }

    // Build package details
    const packageDetails: PackageDetails = pkgOverride || {
      weight: 2,    // default 2 lbs for fashion items
      length: 16,
      width: 12,
      height: 4,
    };

    // Create shipment record with a collision-proof shipment id.
    const shipment = await createShipmentRow({
        adminOrderId: orderType === 'admin' ? orderId : null,
        customOrderId: orderType === 'custom' ? orderId : null,
        rentalOrderId: orderType === 'rental' ? orderId : null,
        recipientName,
        recipientPhone: recipientPhone,
        recipientEmail: recipientEmail,
        addressLine1: address?.addressLine1 || body.addressLine1 || '',
        addressLine2: address?.addressLine2 || body.addressLine2 || null,
        city: address?.city || body.city || '',
        state: address?.state || body.state || '',
        postalCode: address?.postalCode || body.postalCode || '',
        country: address?.country || body.country || 'US',
        carrier: 'UPS',
        packageWeight: packageDetails.weight,
        packageLength: packageDetails.length,
        packageWidth: packageDetails.width,
        packageHeight: packageDetails.height,
        declaredValue: packageDetails.declaredValue || null,
        status: 'pending',
    });

    let labelResult = null;

    // Auto-create label if requested and address is available
    if (autoLabel && address && address.addressLine1) {
      try {
        const svcCode = (serviceCode || '03') as UPSServiceCode;
        const result = await createShipment(address, packageDetails, svcCode, `AWULA K Order ${shipment.shipmentId}`);

        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            trackingNumber: result.trackingNumber,
            labelData: result.labelImageBase64 || null,
            shippingCost: result.totalCharge,
            serviceType: svcCode,
            status: 'label_created',
            shippedAt: new Date(),
          },
        });

        // Record event
        await updateShipmentStatus(shipment.id, 'label_created', {
          description: 'Shipping label created via auto-fulfillment',
          source: 'system',
        });

        labelResult = { trackingNumber: result.trackingNumber, totalCharge: result.totalCharge };
      } catch (err) {
        // Label creation failed — shipment still created as pending
        console.error('Auto-label creation failed:', err);
      }
    }

    return NextResponse.json({
      shipment: { ...shipment, ...(labelResult ? { trackingNumber: labelResult.trackingNumber } : {}) },
      label: labelResult,
      message: labelResult ? 'Shipment created with label' : 'Shipment created (pending label)',
    }, { status: 201 });
  } catch (error) {
    console.error('Fulfillment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fulfillment failed' },
      { status: 500 }
    );
  }
}
