'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui';

const PRIMARY = [
  { href: '/account', label: 'Account', testId: 'account-nav-overview' },
  { href: '/wishlist', label: 'Wishlist', testId: 'account-nav-wishlist' },
  { href: '/account/orders', label: 'Orders', testId: 'account-nav-orders' },
];

const SECONDARY = [
  { href: '/account/addresses', label: 'Addresses', testId: 'account-nav-addresses' },
  { href: '/account/gift-cards', label: 'Gift cards', testId: 'account-nav-gift-cards' },
  { href: '/track', label: 'Track order', testId: 'account-nav-track' },
];

function isActive(path: string, href: string) {
  if (href === '/account') return path === '/account';
  return path === href || path.startsWith(`${href}/`);
}

const PUBLIC_PATHS = new Set(['/track']);

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const { user, ready, requireAuth, logout, openAuth } = useAuth();
  const isPublic = PUBLIC_PATHS.has(path);

  useEffect(() => {
    if (!ready || isPublic || user) return;
    requireAuth({ type: 'navigate', href: path });
  }, [ready, user, path, requireAuth, isPublic]);

  if (!ready) {
    return (
      <div className="account" data-testid="account-page">
        <p className="ds-body">Loading…</p>
      </div>
    );
  }

  if (!user && !isPublic) {
    return (
      <div className="account" data-testid="account-page">
        <header className="account__header">
          <p className="ds-label">Account</p>
          <h1 className="ds-display ds-display--md">{title}</h1>
          <p className="ds-body">Sign in to view your account.</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => openAuth({ tab: 'login', pending: { type: 'navigate', href: path } })}
          >
            Sign in
          </Button>
        </header>
      </div>
    );
  }

  return (
    <div className="account" data-testid="account-page">
      <header className="account__header">
        <p className="ds-label">Account</p>
        <h1 className="ds-display ds-display--md">{title}</h1>
        {user ? (
          <div className="account__auth-row">
            <p className="ds-caption">{user.email}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              data-testid="account-logout"
            >
              Sign out
            </Button>
          </div>
        ) : null}
      </header>

      <div className="account__layout">
        <aside className="account__sidebar" aria-label="Account sections">
          <nav className="account__nav account__nav--primary" data-testid="account-nav">
            {PRIMARY.map((l) => {
              const active = isActive(path, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  scroll={false}
                  className={`ds-label account__nav-link${active ? ' account__nav-link--active' : ''}`}
                  data-testid={l.testId}
                  aria-current={active ? 'page' : undefined}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <nav className="account__nav account__nav--secondary" aria-label="More account">
            {SECONDARY.map((l) => {
              const active = isActive(path, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  scroll={false}
                  className={`ds-caption account__nav-link account__nav-link--secondary${active ? ' account__nav-link--active' : ''}`}
                  data-testid={l.testId}
                  aria-current={active ? 'page' : undefined}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="account__body">{children}</div>
      </div>
    </div>
  );
}

/** Shared empty-state panel with optional SVG icon slot. */
export function AccountEmpty({
  title,
  body,
  action,
  icon,
  testId,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="account-empty" data-testid={testId}>
      <div className="account-empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="ds-display ds-display--sm account-empty__title">{title}</h2>
      <p className="ds-body account-empty__body">{body}</p>
      {action ? <div className="account-empty__action">{action}</div> : null}
    </div>
  );
}

export function OrderStatusPill({ status }: { status: string }) {
  const key = normalizeOrderStatus(status);
  return (
    <span className={`order-pill order-pill--${key}`} data-testid="order-status-pill">
      {labelOrderStatus(status)}
    </span>
  );
}

export function normalizeOrderStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === 'fulfilled' || s === 'delivered') return 'delivered';
  if (s === 'shipped') return 'shipped';
  if (s === 'paid') return 'paid';
  if (s === 'cancelled' || s === 'refunded') return 'cancelled';
  return 'pending';
}

function labelOrderStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === 'fulfilled') return 'Delivered';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
