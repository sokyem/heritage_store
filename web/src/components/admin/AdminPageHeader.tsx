'use client';

import React from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  children?: React.ReactNode;
}

export default function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs,
  children,
}: AdminPageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 lg:pl-8 pl-12">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-3 flex-wrap">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="mx-1">/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="hover:text-gray-600 transition-colors"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-gray-600">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-xl sm:text-2xl font-semibold text-[#1B2A5B] truncate"
              style={{ fontFamily: 'var(--font-heading), serif' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-xs sm:text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
          {children && (
            <div className="flex items-center gap-3 flex-wrap sm:shrink-0">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
