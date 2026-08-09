/**
 * Centralized role + permission registry for AWULA_K.
 *
 * Roles are stored as strings on `User.role` (not a Prisma enum) so that
 * we can add new roles without database migrations. Legacy values are
 * preserved (`founder`, `staff`, `designer`, `customer`).
 */

export const ROLES = [
  'founder', // legacy: full owner
  'admin', // general administrator
  'designer', // partner / staff designer
  'fulfillment', // packing & shipping staff
  'content_editor', // CMS + email template editing only
  'support', // customer service
  'staff', // legacy general staff (~= admin)
  'customer',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  founder: 'Founder',
  admin: 'Administrator',
  designer: 'Designer',
  fulfillment: 'Fulfillment',
  content_editor: 'Content Editor',
  support: 'Support',
  staff: 'Staff (legacy)',
  customer: 'Customer',
};

/** Roles that should see the /admin area at all. */
export const ADMIN_ROLES: Role[] = [
  'founder',
  'admin',
  'staff',
  'designer',
  'fulfillment',
  'content_editor',
  'support',
];

/** Granular permission keys. Add new ones as needed. */
export const PERMISSIONS = [
  'admin.access',
  'products.read',
  'products.write',
  'orders.read',
  'orders.write',
  'orders.fulfill',
  'consultations.read',
  'consultations.write',
  'customers.read',
  'customers.write',
  'designers.manage',
  'cms.pages.write',
  'cms.email.write',
  'cms.theme.write',
  'settings.write',
  'audit.read',
  'team.manage',
  'discounts.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  founder: ALL,
  admin: ALL,
  staff: ALL, // legacy staff = admin
  designer: [
    'admin.access',
    'consultations.read',
    'consultations.write',
    'customers.read',
    'orders.read',
  ],
  fulfillment: [
    'admin.access',
    'orders.read',
    'orders.fulfill',
    'products.read',
    'customers.read',
  ],
  content_editor: [
    'admin.access',
    'cms.pages.write',
    'cms.email.write',
    'cms.theme.write',
    'products.read',
  ],
  support: [
    'admin.access',
    'orders.read',
    'consultations.read',
    'customers.read',
    'customers.write',
  ],
  customer: [],
};

export function hasPermission(role: string | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  const list = ROLE_PERMISSIONS[role as Role];
  if (!list) return false;
  return list.includes(perm);
}

export function isAdminRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return ADMIN_ROLES.includes(role as Role);
}
