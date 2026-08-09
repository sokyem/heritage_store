'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import AdminTopBar from './AdminTopBar';
import { ICON_PATHS, type IconName } from './icons';
import { hasPermission, type Permission } from '@/lib/roles';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  // Permission required to see this link in the sidebar. If omitted, the link
  // is visible to anyone with `admin.access` (i.e. every admin-tier role).
  permission?: Permission;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Icon names reference src/components/admin/icons.ts. To add a new sidebar
// link with a custom glyph, add the d path to icons.ts first, then list it
// here. This keeps every SVG path in one file.
const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
      { href: '/admin/snapshot', label: 'Activity Snapshot', icon: 'snapshot' },
      { href: '/admin/reviews', label: 'Reviews', icon: 'reviews', permission: 'products.read' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { href: '/admin/orders/storefront', label: 'Storefront Orders', icon: 'cart', permission: 'orders.read' },
      { href: '/admin/orders', label: 'Studio Orders', icon: 'studioOrder', permission: 'orders.read' },
      { href: '/admin/orders/custom', label: 'Custom Orders', icon: 'custom', permission: 'orders.read' },
      { href: '/admin/orders/rentals', label: 'Rental Orders', icon: 'rental', permission: 'orders.read' },
      { href: '/admin/orders/shipping', label: 'Shipping & Labels', icon: 'truck', permission: 'orders.fulfill' },
      { href: '/admin/returns', label: 'Returns & RMA', icon: 'returns', permission: 'orders.fulfill' },
      { href: '/admin/production', label: 'Production', icon: 'production', permission: 'orders.fulfill' },
    ],
  },
  {
    label: 'Services',
    items: [
      { href: '/admin/services/consultations', label: 'Consultations', icon: 'video', permission: 'consultations.read' },
      { href: '/admin/services/measurements', label: 'Measurements', icon: 'measurements', permission: 'customers.read' },
      { href: '/admin/services/fittings', label: 'Fittings', icon: 'fitting', permission: 'consultations.read' },
    ],
  },
  {
    label: 'Products',
    items: [
      { href: '/admin/products', label: 'All Products', icon: 'products', permission: 'products.read' },
      { href: '/admin/products/jewelry', label: 'African Jewelry', icon: 'jewelry', permission: 'products.read' },
      { href: '/admin/products/collections', label: 'Collections', icon: 'products', permission: 'products.read' },
      { href: '/admin/products/featured', label: 'Featured / Merch', icon: 'reviews', permission: 'products.write' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/admin/inventory', label: 'Fabrics & Materials', icon: 'package', permission: 'products.read' },
      { href: '/admin/inventory/finished', label: 'Finished Products', icon: 'archive', permission: 'products.read' },
      { href: '/admin/inventory/rentals', label: 'Rental Inventory', icon: 'rental', permission: 'products.read' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/clients', label: 'Customers', icon: 'users', permission: 'customers.read' },
      { href: '/admin/inbox', label: 'Inbox', icon: 'mail', permission: 'customers.read' },
      { href: '/admin/designers', label: 'Designers', icon: 'designer', permission: 'designers.manage' },
      { href: '/admin/designer-applications', label: 'Designer Applications', icon: 'application', permission: 'designers.manage' },
    ],
  },
  {
    label: 'Scheduling',
    items: [
      { href: '/admin/scheduling', label: 'Calendar', icon: 'calendar', permission: 'consultations.read' },
      { href: '/admin/scheduling/slots', label: 'Consultation Slots', icon: 'clock', permission: 'consultations.write' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/admin/finance', label: 'Finance Overview', icon: 'chart', permission: 'orders.read' },
      { href: '/admin/payments', label: 'Payments', icon: 'dollar', permission: 'orders.read' },
      { href: '/admin/quotes', label: 'Quotes & Pricing', icon: 'quote', permission: 'orders.write' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/admin/marketing', label: 'Storefront Control', icon: 'marketing', permission: 'cms.pages.write' },
      { href: '/admin/marketing/mailing-list', label: 'Mailing List', icon: 'mail', permission: 'cms.email.write' },
      { href: '/admin/site-content', label: 'Site Content', icon: 'cms', permission: 'cms.pages.write' },
      { href: '/admin/pages', label: 'Pages (CMS)', icon: 'pages', permission: 'cms.pages.write' },
      { href: '/admin/email-templates', label: 'Email Templates', icon: 'mail', permission: 'cms.email.write' },
      { href: '/admin/team', label: 'Team', icon: 'team', permission: 'team.manage' },
      { href: '/admin/discounts', label: 'Discounts', icon: 'discount', permission: 'discounts.write' },
      { href: '/admin/analytics', label: 'Analytics', icon: 'analytics', permission: 'orders.read' },
    ],
  },
  {
    label: '',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: 'settings', permission: 'settings.write' },
      { href: '/admin/theme', label: 'Theme', icon: 'theme', permission: 'cms.theme.write' },
      { href: '/admin/audit', label: 'Audit Log', icon: 'audit', permission: 'audit.read' },
    ],
  },
];

function NavIcon({ name }: { name: IconName }) {
  const d = ICON_PATHS[name];
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export default function AdminShell({ children, role }: { children: React.ReactNode; role?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? 'w-[68px]' : 'w-[260px]';

  // Build the sidebar from NAV_GROUPS minus anything this role isn't allowed
  // to see. Empty groups are dropped so we don't render dangling headers.
  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.permission || hasPermission(role, item.permission)),
    })).filter((g) => g.items.length > 0);
  }, [role]);

  // Longest-prefix match: a nav item is active only if it's the *most specific*
  // link matching the current path. Without this, a parent like /admin/products
  // would highlight alongside its child /admin/products/collections.
  const activeHref = useMemo(() => {
    const matches = visibleGroups.flatMap((g) => g.items).filter(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    );
    return matches.reduce((best, item) => (item.href.length > best.length ? item.href : best), '');
  }, [pathname, visibleGroups]);

  const isActive = (href: string) => href === activeHref;

  const sidebar = (
    <aside className={`${sidebarWidth} shrink-0 bg-[#0F1A3A] text-white flex flex-col fixed inset-y-0 left-0 z-40 transition-all duration-200 overflow-hidden`}>
      <div className="px-4 py-5 border-b border-white/8 flex items-center justify-between">
        {!collapsed && (
          <div>
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Site
            </Link>
            <h1 className="text-base font-semibold tracking-[0.15em] mt-3" style={{ fontFamily: 'var(--font-heading)' }}>AWULA K</h1>
            <p className="text-[11px] text-white/30 mt-0.5 tracking-wide">Admin Console</p>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto">
            <span className="text-sm font-bold tracking-wider">AK</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors hidden lg:block"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? 'M13 5l7 7-7 7' : 'M11 19l-7-7 7-7'} />
          </svg>
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 overflow-y-auto scrollbar-thin">
        {visibleGroups.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex > 0 ? 'mt-1' : ''}>
            {group.label && !collapsed && (
              <p className="px-3 pt-3.5 pb-1 text-[10px] font-semibold text-white/25 uppercase tracking-[0.15em]">
                {group.label}
              </p>
            )}
            {group.label && collapsed && groupIndex > 0 && (
              <div className="mx-3 my-2 border-t border-white/8" />
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-[#C41E3A] text-white'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.07]'
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-4 py-4 border-t border-white/8">
          <p className="text-[10px] text-white/20 uppercase tracking-[0.15em]">AWULA K · African Luxury Admin</p>
        </div>
      )}
    </aside>
  );

  return (
    <div className="admin-shell min-h-screen flex bg-[#F5F3EF]">
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#0F1A3A] text-white shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
      )}

      <div className="hidden lg:block">{sidebar}</div>
      <div className={`lg:hidden ${mobileOpen ? 'block' : 'hidden'}`}>{sidebar}</div>

      <main className={`flex-1 min-w-0 overflow-auto transition-all duration-200 ${collapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]'}`}>
        <AdminTopBar />
        {children}
      </main>
    </div>
  );
}