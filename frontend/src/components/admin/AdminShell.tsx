'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

const NAV_SECTIONS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'Store',
    items: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/orders', label: 'Orders' },
      { href: '/admin/discounts', label: 'Discounts' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/customers', label: 'Customers' },
      { href: '/admin/activity', label: 'Activity' },
      { href: '/admin/newsletter', label: 'Newsletter' },
      { href: '/admin/saved-items', label: 'Saved items' },
      { href: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/content/hero', label: 'Hero' },
      { href: '/admin/content/announcement', label: 'Announcement' },
      { href: '/admin/content/highlights', label: 'Highlights' },
      { href: '/admin/content/shelves', label: 'Shelves' },
      { href: '/admin/content/blog', label: 'Blog' },
      { href: '/admin/content/stats', label: 'Stats' },
      { href: '/admin/content/delivery', label: 'Delivery estimate' },
    ],
  },
];

const SIDEBAR_KEY = 'studio_admin_sidebar_open';

function linkActive(path: string, href: string): boolean {
  if (href === '/admin') return path === '/admin';
  return path === href || path.startsWith(`${href}/`);
}

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === '0') setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebar(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`admin-layout${open ? '' : ' admin-layout--sidebar-closed'}`}
      data-density="admin"
      data-testid="admin-shell"
    >
      <aside className="admin-sidebar" data-testid="admin-sidebar" hidden={!open}>
        <div className="admin-sidebar__top">
          <Link href="/" className="admin-sidebar__brand ds-label">
            Studio admin
          </Link>
          <button
            type="button"
            className="admin-sidebar__close"
            aria-label="Close sidebar"
            data-testid="admin-sidebar-close"
            onClick={() => toggleSidebar(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="admin-sidebar__nav" aria-label="Admin">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="admin-sidebar__section">
              <p className="admin-sidebar__section-label ds-caption">{section.label}</p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-sidebar__link ds-label${
                    linkActive(path, item.href) ? ' admin-sidebar__link--active' : ''
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <header className="admin-main__header">
          {!open ? (
            <button
              type="button"
              className="admin-sidebar__open"
              aria-label="Open sidebar"
              data-testid="admin-sidebar-open"
              onClick={() => toggleSidebar(true)}
            >
              <MenuIcon />
            </button>
          ) : null}
          <h1 className="ds-display ds-display--sm">{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
