'use client';

import Link from 'next/link';
import { FormEvent, useId, useState } from 'react';
import type { Category } from '@/lib/api';
import { apiSend, ApiError } from '@/lib/api';

type Props = {
  categories?: Category[];
};

type FormState = 'idle' | 'loading' | 'success' | 'duplicate' | 'error';

const HELP = [
  { label: 'Shipping', href: '/track' },
  { label: 'Returns', href: '/account' },
  { label: 'Contact', href: 'mailto:hello@studio.example' },
  { label: 'FAQ', href: '/track' },
];

const COMPANY = [
  { label: 'About', href: '/blog' },
  { label: 'Blog', href: '/blog' },
];

export function SiteFooter({ categories = [] }: Props) {
  const year = new Date().getFullYear();
  const shop = categories.slice(0, 6);
  const formId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [message, setMessage] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);

  function toggle(id: string) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState('error');
      setMessage('Enter a valid email');
      return;
    }
    setState('loading');
    try {
      await apiSend<{ ok: boolean; status: string }>('/newsletter/subscribe', 'POST', {
        email: trimmed,
        source: 'footer',
      });
      setState('success');
      setMessage("You're on the list.");
      setEmail('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setState('duplicate');
        setMessage('This email is already subscribed.');
        return;
      }
      setState('error');
      setMessage('Could not subscribe. Try again.');
    }
  }

  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="site-footer__top-rule" aria-hidden="true" />
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link href="/" className="site-footer__logo ds-display ds-display--sm">
            Studio
          </Link>
          <p className="ds-body site-footer__blurb">
            Women&apos;s basics made for everyday — soft tees, tanks, and layers with lasting fit.
          </p>
        </div>

        <div className="site-footer__cols">
          <FooterCol
            id="shop"
            title="Shop"
            open={openSection === 'shop'}
            onToggle={() => toggle('shop')}
            links={
              shop.length
                ? shop.map((c) => ({ label: c.name, href: `/shop?category=${c.slug}` }))
                : [
                    { label: 'All', href: '/shop' },
                    { label: 'Tees', href: '/shop?category=tees' },
                    { label: 'Tanks', href: '/shop?category=tanks' },
                  ]
            }
          />
          <FooterCol
            id="help"
            title="Help"
            open={openSection === 'help'}
            onToggle={() => toggle('help')}
            links={HELP}
          />
          <FooterCol
            id="company"
            title="Company"
            open={openSection === 'company'}
            onToggle={() => toggle('company')}
            links={COMPANY}
          />
        </div>

        <div className="site-footer__newsletter">
          <h2 className="ds-label site-footer__news-title" id={formId}>
            Newsletter
          </h2>
          <p className="ds-caption site-footer__news-copy">
            Early access to drops and quiet restocks.
          </p>
          <form
            className="site-footer__form"
            onSubmit={(e) => void onSubmit(e)}
            noValidate
            aria-labelledby={formId}
          >
            <label className="visually-hidden" htmlFor={`${formId}-email`}>
              Email
            </label>
            <input
              id={`${formId}-email`}
              className="site-footer__input ds-body--sm"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              disabled={state === 'loading' || state === 'success'}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state !== 'idle' && state !== 'loading') setState('idle');
              }}
              data-testid="footer-newsletter-input"
            />
            <button
              type="submit"
              className="ds-btn ds-btn--accent ds-btn--md site-footer__submit"
              disabled={state === 'loading' || state === 'success'}
              data-testid="footer-newsletter-submit"
            >
              {state === 'loading' ? 'Joining…' : 'Subscribe'}
            </button>
          </form>
          {message ? (
            <p
              className={`ds-caption site-footer__status site-footer__status--${state}`}
              role="status"
              data-testid="footer-newsletter-status"
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="site-footer__bottom">
        <div className="site-footer__social" aria-label="Social">
          <a href="https://instagram.com" className="site-footer__icon" aria-label="Instagram">
            <InstagramIcon />
          </a>
          <a href="https://pinterest.com" className="site-footer__icon" aria-label="Pinterest">
            <PinterestIcon />
          </a>
          <a href="https://tiktok.com" className="site-footer__icon" aria-label="TikTok">
            <TikTokIcon />
          </a>
        </div>
        <div className="site-footer__pay" aria-label="Payment methods">
          <span className="site-footer__pay-badge ds-caption">M-Pesa</span>
          <span className="site-footer__pay-badge ds-caption">Visa</span>
          <span className="site-footer__pay-badge ds-caption">Mastercard</span>
        </div>
        <div className="site-footer__legal">
          <p className="ds-caption site-footer__copy">
            © {year} Studio. All rights reserved.
          </p>
          <p className="ds-caption site-footer__dev-credit">
            Site by{' '}
            <a href="mailto:arnoldchrisoduor@gmail.com" className="site-footer__dev-link">
              arnoldchrisoduor@gmail.com
            </a>
            {' · '}
            <a href="tel:+254791165995" className="site-footer__dev-link">
              +254 791 165 995
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  id,
  title,
  links,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  links: { label: string; href: string }[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`site-footer__col${open ? ' site-footer__col--open' : ''}`}>
      <button
        type="button"
        className="site-footer__col-toggle ds-label"
        aria-expanded={open}
        aria-controls={`footer-col-${id}`}
        onClick={onToggle}
      >
        {title}
        <span className="site-footer__chevron" aria-hidden="true" />
      </button>
      <p className="ds-label site-footer__col-title">{title}</p>
      <ul id={`footer-col-${id}`} className="site-footer__list">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="site-footer__link ds-body--sm">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17" cy="7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PinterestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M10 18l1.2-5.2A2.8 2.8 0 1 1 14.5 9" strokeLinecap="round" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M14 6c.6 2.2 2.2 3.5 4 3.8V13c-1.6-.1-3-.7-4-1.6V16a5 5 0 1 1-5-5c.3 0 .7 0 1 .1V14a2 2 0 1 0 2 2V6h2z" />
    </svg>
  );
}
