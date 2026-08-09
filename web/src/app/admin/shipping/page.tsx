'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/* ─── Types ──────────────────────────────────────────── */

interface Shipment {
  id: string;
  shipmentId: string;
  adminOrderId: string | null;
  customOrderId: string | null;
  rentalOrderId: string | null;
  storefrontOrderId: string | null;
  recipientName: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  carrier: string;
  serviceType: string | null;
  trackingNumber: string | null;
  labelData: string | null;
  packageWeight: number | null;
  shippingCost: number | null;
  status: string;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  notes: string | null;
  createdAt: string;
  itemLabel?: string;
  itemImage?: string | null;
  linkedOrderRef?: string;
}

interface ShippingRate {
  serviceCode: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  estimatedDays?: number;
}

interface Stats {
  total: number;
  pending: number;
  labelCreated: number;
  inTransit: number;
  delivered: number;
  upsConfigured: boolean;
  uspsConfigured: boolean;
  uspsLabelsReady: boolean;
  easyPostReady?: boolean;
  labelProvider?: string;
}

type LinkedOrderType = 'admin' | 'custom' | 'rental' | 'storefront';

interface LinkedOrderOption {
  key: string;
  id: string;
  type: LinkedOrderType;
  displayId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  city: string;
  itemLabel: string;
  status: string;
  sortDate: string;
  /** Optional full shipping address (currently only storefront orders carry this). */
  addressLine1?: string;
  addressLine2?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface StorefrontOrderRecord {
  id: string;
  shortId: string;
  status: string;
  createdAt: string;
  customer: { id?: string; email?: string | null; name?: string | null };
  product?: { id: string; name: string } | null;
  shipping: {
    name?: string | null;
    address?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    phone?: string | null;
  };
  hasShippingAddress: boolean;
}

interface AdminOrderRecord {
  id: string;
  orderId: string;
  item: string;
  fabric: string | null;
  status: string;
  updatedAt: string;
  client: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
  };
}

interface CustomOrderRecord {
  id: string;
  orderId: string;
  eventType: string | null;
  designDescription: string | null;
  status: string;
  updatedAt: string;
  client: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
  };
}

interface RentalOrderRecord {
  id: string;
  rentalId: string;
  status: string;
  startDate: string;
  client: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
  };
  rentalItem: {
    name: string;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#FFA500]/10 text-[#CC8400]',
  label_created: 'bg-[#3B82F6]/10 text-[#2563EB]',
  picked_up: 'bg-[#8B5CF6]/10 text-[#7C3AED]',
  in_transit: 'bg-[color:var(--aw-navy)]/10 text-[color:var(--aw-text-strong)]',
  out_for_delivery: 'bg-[#06B6D4]/10 text-[#0891B2]',
  delivered: 'bg-[#22C55E]/10 text-[#16A34A]',
  returned: 'bg-[#F97316]/10 text-[#EA580C]',
  exception: 'bg-[#EF4444]/10 text-[#DC2626]',
};

const CARRIER_OPTIONS = ['UPS', 'FedEx', 'USPS', 'DHL'];

const UPS_SERVICES: Record<string, string> = {
  '03': 'UPS Ground',
  '02': 'UPS 2nd Day Air',
  '01': 'UPS Next Day Air',
  '13': 'UPS Next Day Air Saver',
  '12': 'UPS 3 Day Select',
};

const USPS_SERVICES: Record<string, string> = {
  USPS_GROUND_ADVANTAGE: 'USPS Ground Advantage',
  PRIORITY_MAIL: 'Priority Mail',
  PRIORITY_MAIL_EXPRESS: 'Priority Mail Express',
  PARCEL_SELECT: 'Parcel Select',
  MEDIA_MAIL: 'Media Mail',
};

// Carriers that have a live label-buying integration in this app.
const LABEL_CARRIERS = new Set(['UPS', 'USPS']);
const DEFAULT_SERVICE_BY_CARRIER: Record<string, string> = {
  UPS: '03',
  USPS: 'USPS_GROUND_ADVANTAGE',
};

// Cap for the optional label upload on the "Record Paid Label" modal so we
// don't push multi-MB blobs into the DB by accident.
const MANUAL_LABEL_MAX_BYTES = 4 * 1024 * 1024;
const MANUAL_LABEL_MAX_MB = MANUAL_LABEL_MAX_BYTES / (1024 * 1024);

/* ─── Page Component ─────────────────────────────────── */

export default function ShippingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, labelCreated: 0, inTransit: 0, delivered: 0, upsConfigured: false, uspsConfigured: false, uspsLabelsReady: false });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [orderOptions, setOrderOptions] = useState<LinkedOrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [selectedOrderKey, setSelectedOrderKey] = useState('');

  // Create label modal
  const [showCreate, setShowCreate] = useState(false);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedRate, setSelectedRate] = useState<string | null>(null);

  // Tracking modal
  const [showTracking, setShowTracking] = useState(false);
  const [trackingData, setTrackingData] = useState<Record<string, unknown> | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Manual-paid-label modal: lets admin record a label they bought outside the
  // app (e.g. usps.com Click-N-Ship) while EPS approval is pending.
  const [manualLabelShipment, setManualLabelShipment] = useState<Shipment | null>(null);
  const [manualLabelSaving, setManualLabelSaving] = useState(false);
  const [manualLabelForm, setManualLabelForm] = useState({
    trackingNumber: '',
    carrier: 'USPS',
    serviceType: '',
    shippingCost: '',
    labelData: '',
    labelFileName: '',
    notes: '',
  });

  // Form state
  const [form, setForm] = useState({
    recipientName: '',
    recipientPhone: '',
    recipientEmail: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    carrier: 'UPS',
    serviceType: '03',
    weight: '2',
    length: '14',
    width: '10',
    height: '6',
    declaredValue: '',
    orderId: '',
    orderType: 'storefront' as LinkedOrderType,
    notes: '',
  });

  const fetchShipments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/shipping?${params}`);
      const data = await res.json();
      setShipments(data.shipments || []);
      setStats(data.stats || stats);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const loadOrderOptions = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const [adminRes, customRes, rentalRes, storefrontRes] = await Promise.all([
        fetch('/api/admin/orders'),
        fetch('/api/admin/custom-orders'),
        fetch('/api/admin/rentals'),
        // pageSize=200 — shipping picker just needs a flat list for the dropdown.
        fetch('/api/admin/orders/storefront?pageSize=200'),
      ]);

      const [adminOrders, customOrders, rentalOrders, storefrontPayload] = await Promise.all([
        adminRes.ok ? adminRes.json() as Promise<AdminOrderRecord[]> : Promise.resolve([]),
        customRes.ok ? customRes.json() as Promise<CustomOrderRecord[]> : Promise.resolve([]),
        rentalRes.ok ? rentalRes.json() as Promise<RentalOrderRecord[]> : Promise.resolve([]),
        storefrontRes.ok ? storefrontRes.json() : Promise.resolve({ items: [] }),
      ]);
      // /api/admin/orders/storefront now returns { items, page, pageSize, … }.
      const storefrontOrders: StorefrontOrderRecord[] = Array.isArray(storefrontPayload)
        ? storefrontPayload // backwards-compat with any stale deploys
        : Array.isArray(storefrontPayload?.items)
          ? storefrontPayload.items
          : [];

      const normalized: LinkedOrderOption[] = [
        ...adminOrders.map((order) => ({
          key: `admin:${order.id}`,
          id: order.id,
          type: 'admin' as const,
          displayId: order.orderId,
          clientName: order.client?.name || 'Unknown client',
          clientPhone: order.client?.phone || '',
          clientEmail: order.client?.email || '',
          city: order.client?.city || '',
          itemLabel: [order.item, order.fabric].filter(Boolean).join(' • '),
          status: order.status,
          sortDate: order.updatedAt,
        })),
        ...customOrders.map((order) => ({
          key: `custom:${order.id}`,
          id: order.id,
          type: 'custom' as const,
          displayId: order.orderId,
          clientName: order.client?.name || 'Unknown client',
          clientPhone: order.client?.phone || '',
          clientEmail: order.client?.email || '',
          city: order.client?.city || '',
          itemLabel: [order.eventType, order.designDescription].filter(Boolean).join(' • ') || 'Custom order',
          status: order.status,
          sortDate: order.updatedAt,
        })),
        ...rentalOrders.map((order) => ({
          key: `rental:${order.id}`,
          id: order.id,
          type: 'rental' as const,
          displayId: order.rentalId,
          clientName: order.client?.name || 'Unknown client',
          clientPhone: order.client?.phone || '',
          clientEmail: order.client?.email || '',
          city: order.client?.city || '',
          itemLabel: order.rentalItem?.name || 'Rental item',
          status: order.status,
          sortDate: order.startDate,
        })),
        ...storefrontOrders
          .filter((order) => order.hasShippingAddress)
          .map((order) => ({
            key: `storefront:${order.id}`,
            id: order.id,
            type: 'storefront' as const,
            displayId: `SO-${order.shortId}`,
            clientName: order.shipping?.name || order.customer?.name || order.customer?.email || 'Storefront customer',
            clientPhone: order.shipping?.phone || '',
            clientEmail: order.customer?.email || '',
            city: order.shipping?.city || '',
            itemLabel: order.product?.name || 'Storefront order',
            status: order.status,
            sortDate: order.createdAt,
            addressLine1: order.shipping?.address || '',
            addressLine2: order.shipping?.address2 || '',
            state: order.shipping?.state || '',
            postalCode: order.shipping?.zip || '',
            country: order.shipping?.country || 'US',
          })),
      ].sort((left, right) => new Date(right.sortDate).getTime() - new Date(left.sortDate).getTime());

      setOrderOptions(normalized);
    } catch {
      setOrderOptions([]);
    } finally {
      setOrdersLoading(false);
      setOrdersLoaded(true);
    }
  }, []);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  useEffect(() => {
    if (!showCreate) {
      // Reset so the next open will re-fetch fresh data.
      if (ordersLoaded) setOrdersLoaded(false);
      return;
    }
    if (ordersLoaded || ordersLoading) return;
    void loadOrderOptions();
  }, [showCreate, ordersLoaded, ordersLoading, loadOrderOptions]);

  const visibleOrderOptions = orderOptions.filter((order) => order.type === form.orderType);

  const applyLinkedOrderToForm = useCallback((order: LinkedOrderOption | null) => {
    setForm((current) => ({
      ...current,
      orderId: order?.id || '',
      orderType: order?.type || current.orderType,
      recipientName: order?.clientName || '',
      recipientPhone: order?.clientPhone || '',
      recipientEmail: order?.clientEmail || '',
      addressLine1: order?.addressLine1 || current.addressLine1,
      addressLine2: order?.addressLine2 || current.addressLine2,
      city: order?.city || current.city,
      state: order?.state || current.state,
      postalCode: order?.postalCode || current.postalCode,
      country: order?.country || current.country,
    }));
  }, []);

  const handleOrderSelection = (nextKey: string) => {
    setSelectedOrderKey(nextKey);
    const selectedOrder = orderOptions.find((order) => order.key === nextKey) || null;
    applyLinkedOrderToForm(selectedOrder);
  };

  const handleOrderTypeChange = (nextType: LinkedOrderType) => {
    setForm((current) => ({
      ...current,
      orderType: nextType,
      orderId: current.orderType === nextType ? current.orderId : '',
    }));

    const selectedOrder = orderOptions.find((order) => order.key === selectedOrderKey);
    if (selectedOrder && selectedOrder.type !== nextType) {
      setSelectedOrderKey('');
      setForm((current) => ({ ...current, orderId: '' }));
    }
  };

  const handleGetRates = async () => {
    setRatesLoading(true);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_rates',
          shipTo: {
            name: form.recipientName,
            phone: form.recipientPhone,
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
          packageDetails: {
            weight: parseFloat(form.weight) || 2,
            length: parseFloat(form.length) || 14,
            width: parseFloat(form.width) || 10,
            height: parseFloat(form.height) || 6,
            declaredValue: form.declaredValue ? parseFloat(form.declaredValue) : undefined,
          },
        }),
      });
      const data = await res.json();
      setRates(data.rates || []);
    } catch {
      /* ignore */
    } finally {
      setRatesLoading(false);
    }
  };

  const handleCreateLabel = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_label',
          shipTo: {
            name: form.recipientName,
            phone: form.recipientPhone,
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
          packageDetails: {
            weight: parseFloat(form.weight) || 2,
            length: parseFloat(form.length) || 14,
            width: parseFloat(form.width) || 10,
            height: parseFloat(form.height) || 6,
            declaredValue: form.declaredValue ? parseFloat(form.declaredValue) : undefined,
          },
          serviceCode: selectedRate || form.serviceType || DEFAULT_SERVICE_BY_CARRIER[form.carrier] || '03',
          carrier: form.carrier,
          orderId: form.orderId || undefined,
          orderType: form.orderType,
          description: `AWULA K order ${form.orderId || 'direct'}`,
        }),
      });
      const data = await res.json();
      if (data.shipment) {
        setShowCreate(false);
        resetForm();
        fetchShipments();
      }
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const handleCreateManual = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_shipment',
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          recipientEmail: form.recipientEmail,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country,
          carrier: form.carrier,
          serviceType: form.serviceType,
          packageWeight: parseFloat(form.weight) || null,
          packageLength: parseFloat(form.length) || null,
          packageWidth: parseFloat(form.width) || null,
          packageHeight: parseFloat(form.height) || null,
          declaredValue: form.declaredValue ? parseFloat(form.declaredValue) : null,
          shippingCost: null,
          orderId: form.orderId || undefined,
          orderType: form.orderType,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (data.shipment) {
        setShowCreate(false);
        resetForm();
        fetchShipments();
      }
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const handleTrack = async (trackingNumber: string) => {
    setShowTracking(true);
    setTrackingLoading(true);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', trackingNumber }),
      });
      const data = await res.json();
      setTrackingData(data.tracking || null);
    } catch {
      /* ignore */
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await fetch('/api/admin/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      fetchShipments();
    } catch {
      /* ignore */
    }
  };

  const handleBuyLabel = async (shipment: Shipment) => {
    const carrierUpper = String(shipment.carrier || '').toUpperCase();
    if (!LABEL_CARRIERS.has(carrierUpper)) {
      window.alert(`Buying a label is only supported for UPS/USPS. This shipment uses ${shipment.carrier}.`);
      return;
    }
    if (!window.confirm(`Buy a ${carrierUpper} label for ${shipment.shipmentId}? This will charge the configured account.`)) {
      return;
    }
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'buy_label',
          shipmentId: shipment.id,
          carrier: carrierUpper,
          serviceCode: shipment.serviceType || DEFAULT_SERVICE_BY_CARRIER[carrierUpper],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Failed to buy label');
        return;
      }
      fetchShipments();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to buy label');
    }
  };

  const openManualLabel = (shipment: Shipment) => {
    const carrierUp = String(shipment.carrier || 'USPS').toUpperCase();
    setManualLabelShipment(shipment);
    setManualLabelForm({
      trackingNumber: shipment.trackingNumber || '',
      carrier: carrierUp || 'USPS',
      serviceType: shipment.serviceType || DEFAULT_SERVICE_BY_CARRIER[carrierUp] || '',
      shippingCost: shipment.shippingCost != null ? String(shipment.shippingCost) : '',
      labelData: '',
      labelFileName: '',
      notes: '',
    });
  };

  const closeManualLabel = () => {
    setManualLabelShipment(null);
    setManualLabelSaving(false);
  };

  const handleManualLabelFile = async (file: File | undefined | null) => {
    if (!file) {
      setManualLabelForm((f) => ({ ...f, labelData: '', labelFileName: '' }));
      return;
    }
    // Soft cap so we don't push multi-MB blobs into the DB by accident.
    if (file.size > MANUAL_LABEL_MAX_BYTES) {
      window.alert(`Label file is larger than ${MANUAL_LABEL_MAX_MB} MB. Please upload a smaller PDF or image.`);
      return;
    }
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setManualLabelForm((f) => ({ ...f, labelData: base64, labelFileName: file.name }));
  };

  const submitManualLabel = async () => {
    if (!manualLabelShipment) return;
    const trackingNumber = manualLabelForm.trackingNumber.trim();
    if (!trackingNumber) {
      window.alert('Please enter the tracking number from the label you purchased.');
      return;
    }
    setManualLabelSaving(true);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_label',
          shipmentId: manualLabelShipment.id,
          trackingNumber,
          carrier: manualLabelForm.carrier,
          serviceType: manualLabelForm.serviceType || undefined,
          shippingCost: manualLabelForm.shippingCost || undefined,
          labelData: manualLabelForm.labelData || undefined,
          notes: manualLabelForm.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Failed to record manual label');
        setManualLabelSaving(false);
        return;
      }
      closeManualLabel();
      fetchShipments();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to record manual label');
      setManualLabelSaving(false);
    }
  };

  const handleVoidLabel = async (shipment: Shipment) => {
    if (!window.confirm(
      `Void label ${shipment.trackingNumber || shipment.shipmentId} and refund it with USPS?\n\nThe shipment will be removed and its order returned to "needs fulfillment" so you can buy a new label. USPS processes the refund within ~2 weeks.`,
    )) {
      return;
    }
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void_label', shipmentId: shipment.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        window.alert(data.error || 'Failed to void the label');
        return;
      }
      fetchShipments();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to void the label');
    }
  };

  const handleDelete = async (shipment: Shipment) => {
    if (!window.confirm(`Delete shipment ${shipment.shipmentId}? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/shipping?id=${encodeURIComponent(shipment.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || 'Failed to delete shipment');
        return;
      }
      fetchShipments();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete shipment');
    }
  };

  const resetForm = () => {
    setForm({
      recipientName: '', recipientPhone: '', recipientEmail: '',
      addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: 'US',
      carrier: 'UPS', serviceType: '03', weight: '2', length: '14', width: '10', height: '6',
      declaredValue: '', orderId: '', orderType: 'storefront', notes: '',
    });
    setSelectedOrderKey('');
    setRates([]);
    setSelectedRate(null);
  };

  const statCards = [
    { label: 'Total Shipments', value: stats.total, color: 'text-[color:var(--aw-text-strong)]' },
    { label: 'Pending', value: stats.pending, color: 'text-[#FFA500]' },
    { label: 'In Transit', value: stats.inTransit, color: 'text-[#3B82F6]' },
    { label: 'Delivered', value: stats.delivered, color: 'text-[color:var(--aw-success)]' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-2 border-[#C41E3A] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--aw-text-strong)]">Shipping & Fulfillment</h1>
          <p className="text-sm text-[color:var(--aw-text-muted)] mt-1">
            Create labels, track shipments, and manage fulfillment.
            {!stats.upsConfigured && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#FFA500]/10 text-[#CC8400]">
                UPS API not configured — labels disabled
              </span>
            )}
            {!stats.uspsConfigured && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#FFA500]/10 text-[#CC8400]">
                USPS API not configured — labels disabled
              </span>
            )}
            {stats.uspsConfigured && !stats.uspsLabelsReady && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#3B82F6]/10 text-[#1D4ED8]">
                USPS rates &amp; tracking live — label-buying pending EPS approval
              </span>
            )}
            {stats.uspsLabelsReady && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#22C55E]/15 text-[#15803D] font-medium">
                ✓ Labels ready — buying via {stats.labelProvider || 'USPS'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/shipping/pickup"
            className="px-4 py-2.5 border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] rounded-lg text-sm font-semibold hover:bg-[color:var(--aw-surface-muted)] transition-colors"
          >
            USPS Pickup
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-[color:var(--aw-danger)] text-white rounded-lg text-sm font-semibold hover:bg-[#A31830] transition-colors"
          >
            + Create Shipment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] p-5">
            <p className="text-xs font-semibold tracking-[0.08em] uppercase text-[color:var(--aw-text-muted)] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'label_created', 'in_transit', 'delivered', 'exception'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === s ? 'bg-[color:var(--aw-navy)] text-white' : 'bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] hover:bg-[#EDE8DF]'
              }`}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by ID, tracking #, or recipient..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[250px] px-4 py-2 border border-[#E8E3DB] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20"
        />
      </div>

      {/* Shipments Table */}
      <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--aw-surface-muted)] border-b border-[#E8E3DB]">
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">ID</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Product / Item</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Recipient</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Carrier</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Tracking</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Cost</th>
                <th className="text-left px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Created</th>
                <th className="text-right px-5 py-3 font-semibold text-[color:var(--aw-text-strong)] text-xs tracking-wider uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[color:var(--aw-text-muted)]">
                    No shipments yet. Click &quot;Create Shipment&quot; to get started.
                  </td>
                </tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id} className="border-b border-[color:var(--aw-border)] hover:bg-[color:var(--aw-surface-muted)]/50 transition-colors">
                    <td className="px-5 py-4 font-medium text-[color:var(--aw-text-strong)]">
                      <p>{s.shipmentId}</p>
                      {s.linkedOrderRef && (
                        <p className="text-xs text-[color:var(--aw-text-muted)] font-normal mt-0.5">{s.linkedOrderRef}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {s.itemImage ? (
                          <div
                            className="w-10 h-10 rounded bg-[color:var(--aw-cream)] bg-cover bg-center flex-shrink-0"
                            style={{ backgroundImage: `url(${s.itemImage})` }}
                            role="img"
                            aria-label={s.itemLabel || 'Item'}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-[color:var(--aw-cream)] flex items-center justify-center flex-shrink-0 text-[color:var(--aw-text-strong)] text-xs font-semibold">
                            {(s.itemLabel || '—')[0]?.toUpperCase() ?? '—'}
                          </div>
                        )}
                        <p className="text-sm text-[color:var(--aw-text-strong)] line-clamp-2 max-w-[200px]">
                          {s.itemLabel || <span className="text-[color:var(--aw-text-muted)] italic">No linked order</span>}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-[color:var(--aw-text-strong)]">{s.recipientName}</p>
                      <p className="text-xs text-[color:var(--aw-text-muted)]">{s.city}, {s.state} {s.postalCode}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-strong)]">{s.carrier}</span>
                    </td>
                    <td className="px-5 py-4">
                      {s.trackingNumber ? (
                        <button
                          onClick={() => handleTrack(s.trackingNumber!)}
                          className="text-xs font-mono text-[#3B82F6] hover:underline"
                        >
                          {s.trackingNumber}
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--aw-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                        {s.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-[color:var(--aw-text-strong)]">
                      {s.shippingCost ? `$${s.shippingCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-5 py-4 text-xs text-[color:var(--aw-text-muted)]">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {(() => {
                          const carrierUp = String(s.carrier).toUpperCase();
                          // Buying a label needs full label-readiness, not just basic API access.
                          const carrierReady =
                            (carrierUp === 'UPS' && stats.upsConfigured) ||
                            (carrierUp === 'USPS' && stats.uspsLabelsReady);
                          if (s.status !== 'pending' || s.trackingNumber || !LABEL_CARRIERS.has(carrierUp)) return null;
                          return carrierReady ? (
                            <>
                              <button
                                onClick={() => handleBuyLabel(s)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/20"
                              >
                                Buy {carrierUp} Label
                              </button>
                              <button
                                onClick={() => openManualLabel(s)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--aw-navy)]/10 text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/20"
                                title="Already paid for this label outside the app? Record the tracking number and cost here."
                              >
                                Record Paid Label
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openManualLabel(s)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--aw-navy)]/10 text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/20"
                              title={carrierUp === 'USPS'
                                ? 'USPS API label-buying needs EPS approval. Buy the label at usps.com (Click-N-Ship) and record the tracking + cost here.'
                                : `${carrierUp} API isn't configured yet. Buy the label externally and record the tracking + cost here.`}
                            >
                              {carrierUp === 'USPS' ? 'Record Paid Label (USPS)' : `Record Paid Label (${carrierUp})`}
                            </button>
                          );
                        })()}
                        {s.status === 'label_created' && (
                          <button
                            onClick={() => handleStatusUpdate(s.id, 'picked_up')}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#8B5CF6]/10 text-[#7C3AED] hover:bg-[#8B5CF6]/20"
                          >
                            Mark Picked Up
                          </button>
                        )}
                        {s.status === 'in_transit' && (
                          <button
                            onClick={() => handleStatusUpdate(s.id, 'delivered')}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#22C55E]/10 text-[#16A34A] hover:bg-[#22C55E]/20"
                          >
                            Mark Delivered
                          </button>
                        )}
                        {s.trackingNumber && (
                          <button
                            onClick={() => handleTrack(s.trackingNumber!)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#3B82F6]/10 text-[#2563EB] hover:bg-[#3B82F6]/20"
                          >
                            Track
                          </button>
                        )}
                        {s.labelData && (
                          <>
                            <a
                              href={`/api/admin/shipping/${s.id}/label`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-3 py-1.5 rounded-lg bg-[#8B7569]/10 text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/20"
                            >
                              View Label
                            </a>
                            <a
                              href={`/api/admin/shipping/${s.id}/label?download=1`}
                              className="text-xs px-3 py-1.5 rounded-lg bg-[#8B7569]/10 text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/20"
                            >
                              Download
                            </a>
                          </>
                        )}
                        {s.trackingNumber && !['in_transit', 'out_for_delivery', 'delivered'].includes(s.status) && (
                          <button
                            onClick={() => handleVoidLabel(s)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#EF4444]/10 text-[#DC2626] hover:bg-[#EF4444]/20"
                          >
                            Void label
                          </button>
                        )}
                        {!['in_transit', 'out_for_delivery', 'delivered'].includes(s.status) && (
                          <button
                            onClick={() => handleDelete(s)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#8B7569]/10 text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/20"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Shipment Modal ──────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl border border-[#E8E3DB]">
            <div className="px-6 py-5 border-b border-[#E8E3DB] flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">Create Shipment</h2>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">Generate UPS label or add manual shipment</p>
              </div>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              {/* Order Link */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Order Type</label>
                    <select value={form.orderType} onChange={(e) => handleOrderTypeChange(e.target.value as LinkedOrderType)} className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20">
                      <option value="storefront">Storefront Order</option>
                      <option value="custom">Custom Order</option>
                      <option value="admin">Ready-to-Wear</option>
                      <option value="rental">Rental</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Select Linked Order</label>
                    <select
                      value={selectedOrderKey}
                      onChange={(e) => handleOrderSelection(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20"
                    >
                      <option value="">{ordersLoading ? 'Loading orders...' : `Choose a ${form.orderType} order`}</option>
                      {visibleOrderOptions.map((order) => (
                        <option key={order.key} value={order.key}>
                          {order.displayId} · {order.clientName} · {order.itemLabel || order.status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Order ID</label>
                    <input value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} placeholder="Order record id" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                  <div className="flex items-end justify-between gap-3 rounded-lg border border-dashed border-[#E8E3DB] bg-[color:var(--aw-bg)] px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)]">Auto-fill</p>
                      <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">Storefront orders auto-fill the full shipping address and link the shipment to the order. Custom / ready-to-wear / rental orders only have name, phone, email, and city — street, state, and ZIP must be entered.</p>
                    </div>
                    {selectedOrderKey ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderKey('');
                          setForm((current) => ({ ...current, orderId: '' }));
                        }}
                        className="shrink-0 text-xs font-semibold text-[color:var(--aw-danger)] hover:text-[#A31830]"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {selectedOrderKey ? (
                  <div className="rounded-lg border border-[#E8E3DB] bg-[color:var(--aw-bg)] px-4 py-3">
                    {(() => {
                      const selectedOrder = orderOptions.find((order) => order.key === selectedOrderKey);
                      if (!selectedOrder) {
                        return null;
                      }

                      return (
                        <div className="space-y-1.5 text-xs text-[color:var(--aw-text-muted)]">
                          <p className="font-semibold text-[color:var(--aw-text-strong)]">{selectedOrder.displayId} linked to {selectedOrder.clientName}</p>
                          <p>{selectedOrder.itemLabel || 'Order details unavailable'}</p>
                          <p>Status: {selectedOrder.status.replace(/_/g, ' ')}</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Linked Order Summary</label>
                  <div className="min-h-[44px] rounded-lg border border-[#E8E3DB] bg-[color:var(--aw-bg)] px-3 py-2.5 text-sm text-[color:var(--aw-text-strong)]">
                    {selectedOrderKey
                      ? (orderOptions.find((order) => order.key === selectedOrderKey)?.itemLabel || 'Order linked')
                      : 'No linked order selected'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Customer City</label>
                  <div className="min-h-[44px] rounded-lg border border-[#E8E3DB] bg-[color:var(--aw-bg)] px-3 py-2.5 text-sm text-[color:var(--aw-text-strong)]">
                    {form.city || 'No city loaded yet'}
                  </div>
                </div>
              </div>

              {/* Recipient */}
              <div>
                <p className="text-xs font-bold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Recipient</p>
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} placeholder="Full name *" className="col-span-2 px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  <input value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} placeholder="Phone" className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  <input value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} placeholder="Email" className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs font-bold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Shipping Address</p>
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} placeholder="Address line 1 *" className="col-span-2 px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  <input value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} placeholder="Apt, suite, etc." className="col-span-2 px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City *" className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State *" className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                    <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="ZIP *" className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                </div>
              </div>

              {/* Package */}
              <div>
                <p className="text-xs font-bold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Package Details</p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] text-[color:var(--aw-text-muted)] mb-1">Weight (lbs)</label>
                    <input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} type="number" step="0.1" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[color:var(--aw-text-muted)] mb-1">L (in)</label>
                    <input value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} type="number" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[color:var(--aw-text-muted)] mb-1">W (in)</label>
                    <input value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} type="number" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[color:var(--aw-text-muted)] mb-1">H (in)</label>
                    <input value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} type="number" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-[10px] text-[color:var(--aw-text-muted)] mb-1">Declared Value ($)</label>
                  <input value={form.declaredValue} onChange={(e) => setForm({ ...form, declaredValue: e.target.value })} type="number" placeholder="For insurance" className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20" />
                </div>
              </div>

              {/* Carrier & Service */}
              <div>
                <p className="text-xs font-bold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Carrier</p>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={form.carrier}
                    onChange={(e) => {
                      const nextCarrier = e.target.value;
                      setForm({
                        ...form,
                        carrier: nextCarrier,
                        serviceType: DEFAULT_SERVICE_BY_CARRIER[nextCarrier] || form.serviceType,
                      });
                      setRates([]);
                      setSelectedRate(null);
                    }}
                    className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20"
                  >
                    {CARRIER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {form.carrier === 'UPS' && (
                    <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20">
                      {Object.entries(UPS_SERVICES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  )}
                  {form.carrier === 'USPS' && (
                    <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20">
                      {Object.entries(USPS_SERVICES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Rate Shopping */}
              {form.carrier === 'UPS' && form.recipientName && form.postalCode && (
                <div>
                  <button
                    onClick={handleGetRates}
                    disabled={ratesLoading}
                    className="text-sm font-semibold text-[#3B82F6] hover:text-[#2563EB] underline"
                  >
                    {ratesLoading ? 'Getting rates...' : '→ Get UPS Rates'}
                  </button>
                  {rates.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {rates.map((r) => (
                        <label
                          key={r.serviceCode}
                          className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedRate === r.serviceCode ? 'border-[#C41E3A] bg-[color:var(--aw-danger)]/5' : 'border-[#E8E3DB] hover:bg-[color:var(--aw-surface-muted)]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="rate"
                              value={r.serviceCode}
                              checked={selectedRate === r.serviceCode}
                              onChange={() => setSelectedRate(r.serviceCode)}
                              className="accent-[#C41E3A]"
                            />
                            <div>
                              <p className="text-sm font-medium text-[color:var(--aw-text-strong)]">{r.serviceName}</p>
                              {r.estimatedDays && <p className="text-xs text-[color:var(--aw-text-muted)]">{r.estimatedDays} business day{r.estimatedDays > 1 ? 's' : ''}</p>}
                            </div>
                          </div>
                          <span className="text-sm font-bold text-[color:var(--aw-text-strong)]">${r.totalCharge.toFixed(2)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes..." className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 resize-none" />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-[#E8E3DB] flex gap-3 justify-end sticky bottom-0 bg-white">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-5 py-2.5 rounded-lg border border-[#E8E3DB] text-sm font-semibold text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]">
                Cancel
              </button>
              {!LABEL_CARRIERS.has(form.carrier) ? (
                <button
                  onClick={handleCreateManual}
                  disabled={creating || !form.recipientName || !form.addressLine1}
                  className="px-5 py-2.5 rounded-lg bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[#0F1A3A] disabled:opacity-40"
                >
                  {creating ? 'Creating...' : 'Create Shipment'}
                </button>
              ) : (
                <button
                  onClick={handleCreateLabel}
                  disabled={creating || !form.recipientName || !form.addressLine1 || !form.postalCode}
                  className="px-5 py-2.5 rounded-lg bg-[color:var(--aw-danger)] text-white text-sm font-semibold hover:bg-[#A31830] disabled:opacity-40"
                >
                  {creating ? 'Generating...' : `Create ${form.carrier} Label`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tracking Modal ─────────────────────────── */}
      {showTracking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[500px] max-h-[70vh] overflow-y-auto rounded-xl shadow-2xl border border-[#E8E3DB]">
            <div className="px-6 py-5 border-b border-[#E8E3DB] flex justify-between items-center">
              <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">Tracking Details</h2>
              <button onClick={() => { setShowTracking(false); setTrackingData(null); }} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              {trackingLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-[#C41E3A] border-t-transparent rounded-full" />
                </div>
              ) : trackingData ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[color:var(--aw-text-muted)]">Tracking #</span>
                    <span className="text-sm font-mono font-semibold text-[color:var(--aw-text-strong)]">{(trackingData as Record<string, unknown>).trackingNumber as string}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[color:var(--aw-text-muted)]">Status</span>
                    <span className="text-sm font-semibold text-[color:var(--aw-text-strong)] capitalize">{((trackingData as Record<string, unknown>).status as string || '').replace(/_/g, ' ')}</span>
                  </div>
                  {String((trackingData as Record<string, unknown>).estimatedDelivery || '') !== '' && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[color:var(--aw-text-muted)]">Est. Delivery</span>
                      <span className="text-sm font-semibold text-[color:var(--aw-success)]">{(trackingData as Record<string, unknown>).estimatedDelivery as string}</span>
                    </div>
                  )}
                  <div className="border-t border-[#E8E3DB] pt-4">
                    <p className="text-xs font-bold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Events</p>
                    <div className="space-y-3">
                      {((trackingData as Record<string, unknown>).events as Array<Record<string, string>> || []).map((ev, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-[color:var(--aw-danger)]' : 'bg-[color:var(--aw-border-strong)]'}`} />
                            {i < ((trackingData as Record<string, unknown>).events as Array<unknown>).length - 1 && <div className="w-px flex-1 bg-[color:var(--aw-border-strong)]" />}
                          </div>
                          <div className="pb-3">
                            <p className="text-sm font-medium text-[color:var(--aw-text-strong)]">{ev.description}</p>
                            <p className="text-xs text-[color:var(--aw-text-muted)]">{ev.location} · {ev.date} {ev.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[color:var(--aw-text-muted)] text-center py-4">No tracking data available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Record Paid Label Modal (manual payment) ──────── */}
      {manualLabelShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl border border-[#E8E3DB]">
            <div className="px-6 py-5 border-b border-[#E8E3DB] flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">Record Paid Label</h2>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">
                  Shipment {manualLabelShipment.shipmentId} — paste the tracking number and what you paid for the label you bought outside the app (e.g. usps.com, UPS Store, pirateship.com).
                </p>
              </div>
              <button onClick={closeManualLabel} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Carrier</label>
                  <select
                    value={manualLabelForm.carrier}
                    onChange={(e) => {
                      const next = e.target.value;
                      setManualLabelForm((f) => ({
                        ...f,
                        carrier: next,
                        serviceType: DEFAULT_SERVICE_BY_CARRIER[next] || f.serviceType,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                  >
                    {CARRIER_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Service</label>
                  {manualLabelForm.carrier === 'UPS' ? (
                    <select
                      value={manualLabelForm.serviceType}
                      onChange={(e) => setManualLabelForm((f) => ({ ...f, serviceType: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                    >
                      {Object.entries(UPS_SERVICES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  ) : manualLabelForm.carrier === 'USPS' ? (
                    <select
                      value={manualLabelForm.serviceType}
                      onChange={(e) => setManualLabelForm((f) => ({ ...f, serviceType: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                    >
                      {Object.entries(USPS_SERVICES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={manualLabelForm.serviceType}
                      onChange={(e) => setManualLabelForm((f) => ({ ...f, serviceType: e.target.value }))}
                      placeholder="Service description"
                      className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Tracking Number <span className="text-[color:var(--aw-danger)]">*</span></label>
                <input
                  type="text"
                  value={manualLabelForm.trackingNumber}
                  onChange={(e) => setManualLabelForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  placeholder="e.g. 9400 1000 0000 0000 0000 00"
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Amount Paid (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualLabelForm.shippingCost}
                  onChange={(e) => setManualLabelForm((f) => ({ ...f, shippingCost: e.target.value }))}
                  placeholder="e.g. 9.45"
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                />
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">What you actually paid for this label. Recorded for accounting.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Label File (optional)</label>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => handleManualLabelFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-[color:var(--aw-text-strong)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[color:var(--aw-navy)]/10 file:text-[color:var(--aw-text-strong)] hover:file:bg-[color:var(--aw-navy)]/20"
                />
                {manualLabelForm.labelFileName && (
                  <p className="text-xs text-[color:var(--aw-success)] mt-1">
                    Attached: {manualLabelForm.labelFileName}
                    <button
                      type="button"
                      onClick={() => setManualLabelForm((f) => ({ ...f, labelData: '', labelFileName: '' }))}
                      className="ml-2 text-[color:var(--aw-text-muted)] underline"
                    >
                      remove
                    </button>
                  </p>
                )}
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">PDF or PNG/JPG of the label you bought. Max {MANUAL_LABEL_MAX_MB} MB. View &amp; Download buttons will use this.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1">Notes (optional)</label>
                <textarea
                  value={manualLabelForm.notes}
                  onChange={(e) => setManualLabelForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Where you bought the label, receipt #, etc."
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E3DB] text-sm"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#E8E3DB] flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={closeManualLabel}
                disabled={manualLabelSaving}
                className="px-4 py-2 rounded-lg border border-[#E8E3DB] text-sm text-[color:var(--aw-text-strong)] hover:bg-[#F5F1EA] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submitManualLabel}
                disabled={manualLabelSaving || !manualLabelForm.trackingNumber.trim()}
                className="px-5 py-2 rounded-lg bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[#0F1A3A] disabled:opacity-40"
              >
                {manualLabelSaving ? 'Saving…' : 'Save Label'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
