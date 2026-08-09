// Pathname → breadcrumb-list helper. Centralises labels so they stay in
// sync with AdminShell sidebar. Pages call:
//
//   <AdminPageHeader breadcrumbs={buildCrumbs(pathname)} title="…" />
//
// Unknown segments fall through to a title-cased version of the slug, so
// adding a new admin route doesn't crash — it just gets a sensible label
// until someone adds an explicit mapping here.

interface Crumb {
  label: string;
  href?: string;
}

// Explicit mappings for slugs whose pretty name isn't a simple title-case
// of the URL. Keyed by full pathname OR a single segment.
const PATH_LABELS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/snapshot': 'Activity Snapshot',
  '/admin/orders': 'Studio Orders',
  '/admin/orders/storefront': 'Storefront Orders',
  '/admin/orders/custom': 'Custom Orders',
  '/admin/orders/rentals': 'Rental Orders',
  '/admin/orders/shipping': 'Shipping & Labels',
  '/admin/clients': 'Customers',
  '/admin/inbox': 'Inbox',
  '/admin/designers': 'Designers',
  '/admin/designer-applications': 'Designer Applications',
  '/admin/inventory': 'Fabrics & Materials',
  '/admin/inventory/finished': 'Finished Products',
  '/admin/inventory/rentals': 'Rental Inventory',
  '/admin/services/consultations': 'Consultations',
  '/admin/services/measurements': 'Measurements',
  '/admin/services/fittings': 'Fittings',
  '/admin/scheduling': 'Scheduling',
  '/admin/scheduling/slots': 'Consultation Slots',
  '/admin/products': 'Products',
  '/admin/products/jewelry': 'African Jewelry',
  '/admin/products/collections': 'Collections',
  '/admin/products/featured': 'Featured / Merch',
  '/admin/finance': 'Finance Overview',
  '/admin/payments': 'Payments',
  '/admin/quotes': 'Quotes & Pricing',
  '/admin/returns': 'Returns & RMA',
  '/admin/production': 'Production',
  '/admin/shipping': 'Shipping',
  '/admin/shipping/pickup': 'USPS Pickup',
  '/admin/marketing': 'Storefront Control',
  '/admin/site-content': 'Site Content',
  '/admin/pages': 'Pages (CMS)',
  '/admin/email-templates': 'Email Templates',
  '/admin/discounts': 'Discounts',
  '/admin/team': 'Team',
  '/admin/analytics': 'Analytics',
  '/admin/settings': 'Settings',
  '/admin/theme': 'Theme',
  '/admin/audit': 'Audit Log',
  '/admin/reviews': 'Reviews',
};

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function labelFor(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  const segment = path.split('/').filter(Boolean).pop() || '';
  // CUID-ish dynamic segments — show a generic label, the page itself
  // owns the actual heading.
  if (/^c[a-z0-9]{20,}$/.test(segment)) return 'Detail';
  return titleCase(segment);
}

export function buildCrumbs(pathname: string): Crumb[] {
  if (!pathname || !pathname.startsWith('/admin')) return [];

  const segments = pathname.split('/').filter(Boolean); // ['admin', 'orders', 'storefront']
  if (segments.length === 0) return [];

  const crumbs: Crumb[] = [];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += '/' + segments[i];
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: labelFor(acc),
      href: isLast ? undefined : acc,
    });
  }
  return crumbs;
}
