/**
 * App-wide settings storage.
 *
 * One row per logical "section" lives in the `AppSetting` table. Each row's
 * `value` JSON blob is validated against a Zod schema at the API boundary
 * before being persisted. Reading code MUST use `getSettings()` so that
 * defaults are merged in for any missing key, ensuring forward-compatibility
 * when new fields are added.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// ─── Schemas ──────────────────────────────────────────────────────

export const GeneralSettingsSchema = z.object({
  siteName: z.string().min(1).max(120),
  tagline: z.string().max(240).default(''),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  dateFormat: z.string().min(1),
  language: z.string().min(2).max(10),
});

export const BusinessSettingsSchema = z.object({
  businessName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().default(''),
  address: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  zip: z.string().default(''),
  country: z.string().min(2).max(2),
  taxRate: z.number().min(0).max(100),
  depositPercent: z.number().min(0).max(100),
});

export const SchedulingSettingsSchema = z.object({
  consultationDuration: z.number().int().positive(),
  fittingDuration: z.number().int().positive(),
  bufferTime: z.number().int().min(0),
  maxBookingsPerSlot: z.number().int().positive(),
  workDays: z.array(z.string()),
  workStart: z.string().regex(/^\d{2}:\d{2}$/),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/),
  autoConfirm: z.boolean(),
  reminderHoursBefore: z.number().int().min(0),
  // Price (in the store currency) charged for a paid consultation, and
  // whether a customer's very first consultation is waived to $0.
  consultationPrice: z.number().min(0).default(40),
  // Default OFF — every consultation is paid. Admins can re-enable a free
  // first session from Settings → Scheduling if they want a new-customer offer.
  firstConsultationFree: z.boolean().default(false),
});

export const NotificationSettingsSchema = z.object({
  emailOrderConfirm: z.boolean(),
  emailPaymentReceived: z.boolean(),
  emailConsultationReminder: z.boolean(),
  emailFittingReminder: z.boolean(),
  lowStockAlert: z.boolean(),
  lowStockThreshold: z.number().int().min(0),
  dailyDigest: z.boolean(),
});

export const IntegrationSettingsSchema = z.object({
  stripeEnabled: z.boolean(),
  stripePublishableKey: z.string().default(''),
  paypalEnabled: z.boolean(),
  paypalClientId: z.string().default(''),
  googleCalendarEnabled: z.boolean(),
  googleCalendarId: z.string().default(''),
  instagramEnabled: z.boolean(),
  instagramHandle: z.string().default(''),
});

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color like #1B2A5B');

export const ThemeSettingsSchema = z.object({
  logoUrl: z.string().default(''),
  faviconUrl: z.string().default(''),
  brandPrimary: hex,
  brandSecondary: hex,
  brandAccent: hex,
  background: hex,
  surface: hex,
  textPrimary: hex,
  textMuted: hex,
  border: hex,
  fontHeading: z.string().min(1),
  fontBody: z.string().min(1),
  radius: z.string().min(1),
  buttonStyle: z.enum(['square', 'rounded', 'pill']),
  customCss: z.string().max(20000).default(''),
});

// Shipping origin used as the From address on every label and as the
// pickup location for USPS carrier pickup. Editable via the admin so
// the studio address can change without a redeploy.
export const ShipperAddressSettingsSchema = z.object({
  name: z.string().default('Heritage Store'),
  attentionName: z.string().default(''),
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  phone: z.string().default(''),
  addressLine1: z.string().default(''),
  addressLine2: z.string().default(''),
  city: z.string().default(''),
  state: z.string().length(2).or(z.literal('')).default(''),
  zip: z.string().default(''),
  country: z.string().length(2).default('US'),
  // When true, checkout quotes rates (for admin visibility) but doesn't add
  // shipping to the customer's charge — AWULA K eats the cost. Use this
  // while waiting on carrier label/EPS approval; flip off once you can
  // auto-buy postage and want to pass the cost through.
  absorbShippingCost: z.boolean().default(true),
});

export const SETTINGS_SCHEMAS = {
  general: GeneralSettingsSchema,
  business: BusinessSettingsSchema,
  scheduling: SchedulingSettingsSchema,
  notifications: NotificationSettingsSchema,
  integrations: IntegrationSettingsSchema,
  theme: ThemeSettingsSchema,
  shipper: ShipperAddressSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;

export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;
export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;
export type SchedulingSettings = z.infer<typeof SchedulingSettingsSchema>;
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>;
export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;
export type ShipperAddressSettings = z.infer<typeof ShipperAddressSettingsSchema>;

export type AllSettings = {
  general: GeneralSettings;
  business: BusinessSettings;
  scheduling: SchedulingSettings;
  notifications: NotificationSettings;
  integrations: IntegrationSettings;
  theme: ThemeSettings;
  shipper: ShipperAddressSettings;
};

// ─── Defaults ─────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AllSettings = {
  general: {
    siteName: 'HERITAGE STORE',
    tagline: 'Quality ready-to-wear, made to last.',
    currency: 'USD',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
  },
  business: {
    businessName: 'Heritage Store',
    // TODO: point at the real heritage_store domain once it exists.
    email: 'info@awulak.com',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    taxRate: 0,
    depositPercent: 50,
  },
  scheduling: {
    consultationDuration: 30,
    fittingDuration: 45,
    bufferTime: 15,
    maxBookingsPerSlot: 1,
    workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    workStart: '09:00',
    workEnd: '18:00',
    autoConfirm: false,
    reminderHoursBefore: 24,
    consultationPrice: 40,
    firstConsultationFree: false,
  },
  notifications: {
    emailOrderConfirm: true,
    emailPaymentReceived: true,
    emailConsultationReminder: true,
    emailFittingReminder: true,
    lowStockAlert: true,
    lowStockThreshold: 5,
    dailyDigest: false,
  },
  integrations: {
    stripeEnabled: true,
    stripePublishableKey: '',
    paypalEnabled: false,
    paypalClientId: '',
    googleCalendarEnabled: false,
    googleCalendarId: '',
    instagramEnabled: false,
    instagramHandle: '',
  },
  theme: {
    logoUrl: '',
    faviconUrl: '',
    brandPrimary: '#1B2A5B',
    // Deep gold, not bright: this value is used as a fill behind white text,
    // where #D4AF37 would land at 2.1:1. #8F6F1A clears AA at 4.7:1.
    brandSecondary: '#8F6F1A',
    brandAccent: '#8B7569',
    background: '#FAF7F2',
    surface: '#FFFFFF',
    textPrimary: '#2C1A11',
    textMuted: '#5C3D2E',
    border: '#E7E1D8',
    fontHeading: 'Playfair Display',
    fontBody: 'DM Sans',
    radius: '6px',
    buttonStyle: 'square',
    customCss: '',
  },
  // Shipper defaults read from env so existing deployments work out of the
  // box. Once an admin saves this section, the DB row takes precedence.
  shipper: {
    name: process.env.USPS_SHIPPER_NAME || process.env.UPS_SHIPPER_NAME || 'Heritage Store',
    attentionName: process.env.UPS_SHIPPER_ATTENTION || 'Heritage Store',
    firstName: process.env.USPS_SHIPPER_FIRSTNAME || 'Heritage',
    lastName: process.env.USPS_SHIPPER_LASTNAME || 'Store',
    phone: process.env.USPS_SHIPPER_PHONE || process.env.UPS_SHIPPER_PHONE || '',
    addressLine1: process.env.USPS_SHIPPER_ADDRESS1 || process.env.UPS_SHIPPER_ADDRESS1 || '',
    addressLine2: process.env.USPS_SHIPPER_ADDRESS2 || process.env.UPS_SHIPPER_ADDRESS2 || '',
    city: process.env.USPS_SHIPPER_CITY || process.env.UPS_SHIPPER_CITY || '',
    state: process.env.USPS_SHIPPER_STATE || process.env.UPS_SHIPPER_STATE || '',
    zip: process.env.USPS_SHIPPER_ZIP || process.env.UPS_SHIPPER_ZIP || '',
    country: process.env.UPS_SHIPPER_COUNTRY || 'US',
    absorbShippingCost: true,
  },
};

// ─── Read helpers ─────────────────────────────────────────────────

/**
 * Load one settings section, merged over defaults. Safe to call from
 * server components — missing rows or partial blobs degrade to defaults.
 */
export async function getSetting<K extends SettingsKey>(key: K): Promise<AllSettings[K]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const defaults = DEFAULT_SETTINGS[key];
  if (!row) return defaults;
  const schema = SETTINGS_SCHEMAS[key];
  const parsed = schema.safeParse({ ...defaults, ...(row.value as Record<string, unknown>) });
  return parsed.success ? (parsed.data as AllSettings[K]) : defaults;
}

/**
 * Load every settings section in a single query. Useful for the admin
 * Settings page or for hydrating the storefront layout.
 */
export async function getSettings(): Promise<AllSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.keys(SETTINGS_SCHEMAS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));
  const out = {} as AllSettings;
  (Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]).forEach((key) => {
    const defaults = DEFAULT_SETTINGS[key];
    const stored = byKey.get(key) ?? {};
    const schema = SETTINGS_SCHEMAS[key];
    const parsed = schema.safeParse({ ...defaults, ...stored });
    (out as any)[key] = parsed.success ? parsed.data : defaults;
  });
  return out;
}

// ─── Write helper ─────────────────────────────────────────────────

export async function saveSetting<K extends SettingsKey>(
  key: K,
  value: AllSettings[K],
  actor?: { id?: string | null; email?: string | null },
): Promise<AllSettings[K]> {
  const schema = SETTINGS_SCHEMAS[key];
  const parsed = schema.parse(value);
  await prisma.appSetting.upsert({
    where: { key },
    create: {
      key,
      category: key,
      value: parsed as any,
      updatedBy: actor?.email ?? actor?.id ?? null,
    },
    update: {
      value: parsed as any,
      updatedBy: actor?.email ?? actor?.id ?? null,
    },
  });
  return parsed as AllSettings[K];
}
