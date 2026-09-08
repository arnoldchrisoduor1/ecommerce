'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/content/hero', label: 'Hero' },
  { href: '/admin/content/announcement', label: 'Announcement' },
  { href: '/admin/content/highlights', label: 'Highlights' },
  { href: '/admin/content/shelves', label: 'Shelves' },
  { href: '/admin/content/blog', label: 'Blog' },
  { href: '/admin/content/stats', label: 'Stats' },
];

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const path = usePathname();

  return (
    <div className="admin-layout" data-density="admin" data-testid="admin-shell">
      <aside className="admin-sidebar" data-testid="admin-sidebar">
        <Link href="/" className="admin-sidebar__brand ds-label">
          Studio admin
        </Link>
        <nav className="admin-sidebar__nav" aria-label="Admin">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-sidebar__link ds-label${
                path === item.href || path.startsWith(`${item.href}/`)
                  ? ' admin-sidebar__link--active'
                  : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <header className="admin-main__header">
          <h1 className="ds-display ds-display--sm">{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}
