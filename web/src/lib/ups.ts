// ═══════════════════════════════════════════════════════════════════
// UPS Shipping Integration — AWULA K
// Uses UPS OAuth 2.0 + REST API v1
// Docs: https://developer.ups.com/api/
// ═══════════════════════════════════════════════════════════════════

const UPS_BASE_URL = process.env.UPS_BASE_URL || 'https://onlinetools.ups.com';
const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID || '';
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET || '';
const UPS_ACCOUNT_NUMBER = process.env.UPS_ACCOUNT_NUMBER || '';

// Shipper address — loaded from DB-backed settings at call time so the admin
// can change the studio address without a redeploy. See lib/shipper-address.ts.
import { getShipperAddress } from '@/lib/shipper-address';

// Fail-closed guard: in production, missing credentials must error loudly
// instead of silently degrading to mock data. Dev/test keep the mock behavior
// so the local app boots without real USPS/UPS keys.
function assertCredsForProd(feature: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`UPS ${feature} unavailable: UPS_CLIENT_ID/UPS_CLIENT_SECRET/UPS_ACCOUNT_NUMBER must be set in production`);
  }
}

// ─── OAuth Token Management ───────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${UPS_BASE_URL}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPS OAuth failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
  };

  return cachedToken.token;
}

// ─── Types ────────────────────────────────────────────────────────

export interface ShipToAddress {
  name: string;
  attentionName?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PackageDetails {
  weight: number; // lbs
  length: number; // inches
  width: number;
  height: number;
  declaredValue?: number;
  description?: string;
}

export type UPSServiceCode =
  | '03'  // UPS Ground
  | '02'  // UPS 2nd Day Air
  | '01'  // UPS Next Day Air
  | '13'  // UPS Next Day Air Saver
  | '12'  // UPS 3 Day Select
  | '59'  // UPS 2nd Day Air A.M.
  | '14'  // UPS Next Day Air Early
  | '65'; // UPS Saver (International)

export const UPS_SERVICES: Record<UPSServiceCode, string> = {
  '03': 'UPS Ground',
  '02': 'UPS 2nd Day Air',
  '01': 'UPS Next Day Air',
  '13': 'UPS Next Day Air Saver',
  '12': 'UPS 3 Day Select',
  '59': 'UPS 2nd Day Air A.M.',
  '14': 'UPS Next Day Air Early',
  '65': 'UPS Saver (International)',
};

// ─── Rate Shopping ────────────────────────────────────────────────

export interface ShippingRate {
  serviceCode: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  estimatedDays?: number;
}

export async function getRates(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails
): Promise<ShippingRate[]> {
  if (!UPS_CLIENT_ID) {
    assertCredsForProd('rate quotes');
    return getMockRates(packageDetails);
  }

  const token = await getAccessToken();
  const shipper = await getShipperAddress();

  const body = {
    RateRequest: {
      Request: { SubVersion: '2403' },
      Shipment: {
        Shipper: {
          Name: shipper.name,
          ShipperNumber: UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: [shipper.addressLine1, shipper.addressLine2].filter(Boolean),
            City: shipper.city,
            StateProvinceCode: shipper.state,
            PostalCode: shipper.zip,
            CountryCode: shipper.country,
          },
        },
        ShipTo: {
          Name: shipTo.name,
          Address: {
            AddressLine: [shipTo.addressLine1, shipTo.addressLine2].filter(Boolean),
            City: shipTo.city,
            StateProvinceCode: shipTo.state,
            PostalCode: shipTo.postalCode,
            CountryCode: shipTo.country,
          },
        },
        Package: {
          PackagingType: { Code: '02', Description: 'Customer Supplied' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(packageDetails.length),
            Width: String(packageDetails.width),
            Height: String(packageDetails.height),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(packageDetails.weight),
          },
          ...(packageDetails.declaredValue && {
            PackageServiceOptions: {
              DeclaredValue: {
                CurrencyCode: 'USD',
                MonetaryValue: String(packageDetails.declaredValue),
              },
            },
          }),
        },
      },
    },
  };

  const res = await fetch(`${UPS_BASE_URL}/api/rating/v2403/Shop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'transId': `awulak-${Date.now()}`,
      'transactionSrc': 'AWULAK',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPS Rate request failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const ratedShipments = data.RateResponse?.RatedShipment || [];

  return ratedShipments.map((rs: Record<string, unknown>) => {
    const svc = rs.Service as Record<string, string>;
    const charge = rs.TotalCharges as Record<string, string>;
    const days = rs.GuaranteedDelivery as Record<string, string> | undefined;
    return {
      serviceCode: svc.Code,
      serviceName: UPS_SERVICES[svc.Code as UPSServiceCode] || `UPS Service ${svc.Code}`,
      totalCharge: parseFloat(charge.MonetaryValue),
      currency: charge.CurrencyCode,
      estimatedDays: days?.BusinessDaysInTransit ? parseInt(days.BusinessDaysInTransit) : undefined,
    };
  });
}

// ─── Create Shipment & Label ──────────────────────────────────────

export interface ShipmentResult {
  trackingNumber: string;
  labelImageBase64: string;
  labelFormat: string;
  totalCharge: number;
  currency: string;
}

export async function createShipment(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
  serviceCode: UPSServiceCode = '03',
  description?: string
): Promise<ShipmentResult> {
  if (!UPS_CLIENT_ID) {
    assertCredsForProd('label creation');
    return getMockShipment();
  }

  const token = await getAccessToken();
  const shipper = await getShipperAddress();

  const body = {
    ShipmentRequest: {
      Request: { SubVersion: '2403' },
      Shipment: {
        Description: description || 'AWULA K Fashion Order',
        Shipper: {
          Name: shipper.name,
          AttentionName: shipper.attentionName,
          Phone: { Number: shipper.phone },
          ShipperNumber: UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: [shipper.addressLine1, shipper.addressLine2].filter(Boolean),
            City: shipper.city,
            StateProvinceCode: shipper.state,
            PostalCode: shipper.zip,
            CountryCode: shipper.country,
          },
        },
        ShipTo: {
          Name: shipTo.name,
          AttentionName: shipTo.attentionName || shipTo.name,
          Phone: shipTo.phone ? { Number: shipTo.phone } : undefined,
          Address: {
            AddressLine: [shipTo.addressLine1, shipTo.addressLine2].filter(Boolean),
            City: shipTo.city,
            StateProvinceCode: shipTo.state,
            PostalCode: shipTo.postalCode,
            CountryCode: shipTo.country,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: UPS_ACCOUNT_NUMBER },
          },
        },
        Service: { Code: serviceCode },
        Package: {
          PackagingType: { Code: '02', Description: 'Customer Supplied' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(packageDetails.length),
            Width: String(packageDetails.width),
            Height: String(packageDetails.height),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(packageDetails.weight),
          },
          ...(packageDetails.declaredValue && {
            PackageServiceOptions: {
              DeclaredValue: {
                CurrencyCode: 'USD',
                MonetaryValue: String(packageDetails.declaredValue),
              },
            },
          }),
        },
      },
      LabelSpecification: {
        LabelImageFormat: { Code: 'PNG' },
        LabelStockSize: { Height: '6', Width: '4' },
      },
    },
  };

  const res = await fetch(`${UPS_BASE_URL}/api/shipments/v2403/ship`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'transId': `awulak-${Date.now()}`,
      'transactionSrc': 'AWULAK',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPS Shipment creation failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const shipResult = data.ShipmentResponse?.ShipmentResults;
  const pkg = shipResult?.PackageResults?.[0] || shipResult?.PackageResults;
  const charges = shipResult?.ShipmentCharges?.TotalCharges;

  return {
    trackingNumber: pkg?.TrackingNumber || '',
    labelImageBase64: pkg?.ShippingLabel?.GraphicImage || '',
    labelFormat: 'PNG',
    totalCharge: charges ? parseFloat(charges.MonetaryValue) : 0,
    currency: charges?.CurrencyCode || 'USD',
  };
}

// ─── Track Shipment ───────────────────────────────────────────────

export interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  date: string;
  time: string;
}

export interface TrackingResult {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: TrackingEvent[];
}

export async function trackShipment(trackingNumber: string): Promise<TrackingResult> {
  if (!UPS_CLIENT_ID) {
    assertCredsForProd('tracking lookup');
    return getMockTracking(trackingNumber);
  }

  const token = await getAccessToken();

  const res = await fetch(
    `${UPS_BASE_URL}/api/track/v1/details/${trackingNumber}?locale=en_US&returnSignature=false`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'transId': `awulak-${Date.now()}`,
        'transactionSrc': 'AWULAK',
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPS Tracking failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const pkg = data.trackResponse?.shipment?.[0]?.package?.[0];

  const events: TrackingEvent[] = (pkg?.activity || []).map((act: Record<string, unknown>) => {
    const loc = act.location as Record<string, Record<string, string>> | undefined;
    const st = act.status as Record<string, string> | undefined;
    return {
      status: st?.type || '',
      description: st?.description || '',
      location: loc?.address ? `${loc.address.city || ''}, ${loc.address.stateProvince || ''} ${loc.address.countryCode || ''}`.trim() : '',
      date: (act.date as string) || '',
      time: (act.time as string) || '',
    };
  });

  const currentStatus = pkg?.currentStatus?.type || 'unknown';
  const delivery = pkg?.deliveryDate?.[0];

  return {
    trackingNumber,
    status: currentStatus,
    estimatedDelivery: delivery?.type === 'SDD' ? delivery.date : undefined,
    actualDelivery: currentStatus === 'D' ? events[0]?.date : undefined,
    events,
  };
}

// ─── Address Validation ───────────────────────────────────────────

export interface AddressValidationResult {
  isValid: boolean;
  classification: string; // residential, commercial, unknown
  suggestedAddress?: ShipToAddress;
}

export async function validateAddress(address: ShipToAddress): Promise<AddressValidationResult> {
  if (!UPS_CLIENT_ID) {
    assertCredsForProd('address validation');
    return { isValid: true, classification: 'residential' };
  }

  const token = await getAccessToken();

  const body = {
    XAVRequest: {
      AddressKeyFormat: {
        AddressLine: [address.addressLine1, address.addressLine2].filter(Boolean),
        PoliticalDivision2: address.city,
        PoliticalDivision1: address.state,
        PostcodePrimaryLow: address.postalCode,
        CountryCode: address.country,
      },
    },
  };

  const res = await fetch(`${UPS_BASE_URL}/api/addressvalidation/v2/3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'transId': `awulak-${Date.now()}`,
      'transactionSrc': 'AWULAK',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { isValid: false, classification: 'unknown' };
  }

  const data = await res.json();
  const xavRes = data.XAVResponse;
  const isValid = xavRes?.ValidAddressIndicator !== undefined;
  const classification = xavRes?.AddressClassification?.Description || 'unknown';

  return { isValid, classification: classification.toLowerCase() };
}

// ─── Mock Data (when UPS credentials not configured) ──────────────

function getMockRates(pkg: PackageDetails): ShippingRate[] {
  const baseRate = Math.max(8, pkg.weight * 1.5 + 5);
  return [
    { serviceCode: '03', serviceName: 'UPS Ground', totalCharge: Math.round(baseRate * 100) / 100, currency: 'USD', estimatedDays: 5 },
    { serviceCode: '12', serviceName: 'UPS 3 Day Select', totalCharge: Math.round(baseRate * 1.8 * 100) / 100, currency: 'USD', estimatedDays: 3 },
    { serviceCode: '02', serviceName: 'UPS 2nd Day Air', totalCharge: Math.round(baseRate * 2.5 * 100) / 100, currency: 'USD', estimatedDays: 2 },
    { serviceCode: '01', serviceName: 'UPS Next Day Air', totalCharge: Math.round(baseRate * 4 * 100) / 100, currency: 'USD', estimatedDays: 1 },
  ];
}

function getMockShipment(): ShipmentResult {
  return {
    trackingNumber: `1Z999AA1${String(Date.now()).slice(-10)}`,
    labelImageBase64: '', // empty in dev mode
    labelFormat: 'PNG',
    totalCharge: 12.50,
    currency: 'USD',
  };
}

function getMockTracking(trackingNumber: string): TrackingResult {
  return {
    trackingNumber,
    status: 'in_transit',
    estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    events: [
      { status: 'I', description: 'In Transit', location: 'Atlanta, GA US', date: new Date().toISOString().split('T')[0], time: '14:30' },
      { status: 'P', description: 'Picked Up', location: 'Origin', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], time: '10:00' },
    ],
  };
}

// ─── Helper: Check if UPS is configured ───────────────────────────

export function isUPSConfigured(): boolean {
  return !!(UPS_CLIENT_ID && UPS_CLIENT_SECRET && UPS_ACCOUNT_NUMBER);
}
