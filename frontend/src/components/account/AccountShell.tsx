'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const LINKS = [
  { href: '/account', label: 'Overview', testId: 'account-nav-overview' },
  { href: '/account/orders', label: 'Orders', testId: 'account-nav-orders' },
  { href: '/wishlist', label: 'Wishlist', testId: 'account-nav-wishlist' },
  { href: '/account/addresses', label: 'Addresses', testId: 'account-nav-addresses' },
  { href: '/account/gift-cards', label: 'Gift cards', testId: 'account-nav-gift-cards' },
  { href: '/track', label: 'Track order', testId: 'account-nav-track' },
];

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const path = usePathname();

  return (
    <div className="account" data-testid="account-page">
      <header className="account__header">
        <p className="ds-label">Account</p>
        <h1 className="ds-display ds-display--md">{title}</h1>
      </header>
      <nav className="account__nav" aria-label="Account" data-testid="account-nav">
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`ds-label account__nav-link${active ? ' account__nav-link--active' : ''}`}
              data-testid={l.testId}
              aria-current={active ? 'page' : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="account__body">{children}</div>
    </div>
  );
}
