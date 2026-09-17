'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';

const NAV_SECTIONS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'Store',
    items: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/categories', label: 'Categories' },
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
    label: 'System',
    items: [
      { href: '/admin/ai-usage', label: 'AI Usage' },
      { href: '/admin/settings', label: 'Settings' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/content/hero', label: 'Hero' },
      { href: '/admin/content/announcement', label: 'Announcement' },
      { href: '/admin/content/idle-promo', label: 'Idle promo' },
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
  const { ready } = useAdminUi();
  const [open, setOpen] = useState(true);
  const [activityUnread, setActivityUnread] = useState(0);
  const [activityNotifications, setActivityNotifications] = useState(0);

  const loadUnread = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await adminGet<{ unread: number; notifications: number }>('/activity/unread');
      setActivityUnread(r.unread ?? 0);
      setActivityNotifications(r.notifications ?? 0);
    } catch {
      /* ignore */
    }
  }, [ready]);

  useEffect(() => {
    void loadUnread();
    const id = window.setInterval(() => void loadUnread(), 30_000);
    const onRead = () => {
      setActivityUnread(0);
      setActivityNotifications(0);
    };
    window.addEventListener('admin:activity-read', onRead);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('admin:activity-read', onRead);
    };
  }, [loadUnread]);

  useEffect(() => {
    if (!ready || path !== '/admin/activity') return;
    void adminSend('/activity/mark-read', 'POST', {}).then(onReadLocal).catch(() => {});
    function onReadLocal() {
      setActivityUnread(0);
      setActivityNotifications(0);
      window.dispatchEvent(new Event('admin:activity-read'));
    }
  }, [ready, path]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === '0') {
        setOpen(false);
        return;
      }
      if (stored === '1') {
        setOpen(true);
        return;
      }
      /* First visit: closed drawer on narrow viewports so layout never fights the page width. */
      if (window.matchMedia('(max-width: 768px)').matches) {
        setOpen(false);
      }
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
                <div key={item.href} className="admin-sidebar__link-row">
                  <Link
                    href={item.href}
                    className={`admin-sidebar__link ds-label${
                      linkActive(path, item.href) ? ' admin-sidebar__link--active' : ''
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.href === '/admin/activity' && activityUnread > 0 ? (
                    <span
                      className={`admin-sidebar__badge${
                        activityNotifications > 0 ? ' admin-sidebar__badge--alert' : ''
                      }`}
                      data-testid="admin-activity-unread-badge"
                      aria-label={`${activityUnread} unread activity events`}
                    >
                      {activityUnread}
                    </span>
                  ) : null}
                </div>
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
