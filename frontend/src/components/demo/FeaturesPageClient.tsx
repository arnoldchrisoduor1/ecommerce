'use client';

import Link from 'next/link';
import './features.css';

const EMAIL =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_EMAIL || 'arnoldchrisoduor@gmail.com';
const PHONE =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_PHONE || '+254791165995';

type Feature = {
  title: string;
  body: string;
  icon: 'search' | 'eye' | 'bag' | 'chat' | 'tryon' | 'reel' | 'ticker' | 'blog' | 'shield' | 'mail' | 'device' | 'box' | 'users' | 'chart' | 'tag' | 'megaphone' | 'bell' | 'export' | 'spark' | 'lock';
};

const CUSTOMER: Feature[] = [
  {
    icon: 'search',
    title: 'Search & browse',
    body: 'Find pieces fast with filters, categories, and clean product grids built for mobile and desktop.',
  },
  {
    icon: 'eye',
    title: 'Live viewing counts',
    body: 'Subtle “viewing now” presence on products and posts builds confidence without shouting.',
  },
  {
    icon: 'bag',
    title: 'Wishlist, cart & checkout',
    body: 'Save favorites, manage the bag, and check out with a streamlined flow that stays out of the way.',
  },
  {
    icon: 'chat',
    title: 'AI stylist chat',
    body: 'Catalog-aware outfit advice with real product cards you can open or add — not invented SKUs.',
  },
  {
    icon: 'tryon',
    title: 'AI virtual try-on',
    body: 'See how a piece looks on a photo before buying, with gated access for serious shoppers.',
  },
  {
    icon: 'reel',
    title: 'Highlights reel',
    body: 'Instagram-style multi-image stories with captions that deep-link into products.',
  },
  {
    icon: 'ticker',
    title: 'Social proof ticker',
    body: 'Real recent-purchase activity keeps the storefront feeling alive.',
  },
  {
    icon: 'blog',
    title: 'Blog & reading stats',
    body: 'Style content with live “reading now” and total reads to show what resonates.',
  },
  {
    icon: 'shield',
    title: 'Optional two-step security',
    body: 'Customers can harden accounts for sensitive actions like AI try-on.',
  },
  {
    icon: 'mail',
    title: 'Newsletter capture',
    body: 'Footer and landing signup with admin-ready subscriber lists.',
  },
  {
    icon: 'device',
    title: 'Responsive design system',
    body: 'One visual language across shop, account, and admin — tuned for touch and keyboard.',
  },
];

const ADMIN: Feature[] = [
  {
    icon: 'box',
    title: 'Product management',
    body: 'Categories, variants, per-variant imagery, and stock status in one place.',
  },
  {
    icon: 'users',
    title: 'Orders & customers',
    body: 'Order detail plus customer rows with live last-seen / online presence.',
  },
  {
    icon: 'chart',
    title: 'Traffic & product analytics',
    body: 'Most-viewed products, page traffic, and active-user windows with per-user detail.',
  },
  {
    icon: 'blog',
    title: 'Blog read analytics',
    body: 'See which posts draw attention and how long readers stay.',
  },
  {
    icon: 'tag',
    title: 'Discounts & promos',
    body: 'Create, edit, disable, and schedule codes without digging through the database.',
  },
  {
    icon: 'megaphone',
    title: 'Announcement & idle promos',
    body: 'Configure the top bar and idle-triggered banners from the CMS.',
  },
  {
    icon: 'bell',
    title: 'Activity feed',
    body: 'Unread notifications for cart adds, orders, and other store events.',
  },
  {
    icon: 'export',
    title: 'Newsletter export',
    body: 'Manage subscribers and export for campaigns outside the platform.',
  },
  {
    icon: 'spark',
    title: 'AI usage controls',
    body: 'Monitor stylist/try-on usage and gate access per user or globally.',
  },
  {
    icon: 'lock',
    title: 'Admin security',
    body: 'Role-aware admin access with 2FA-protected sensitive actions like password changes.',
  },
];

export function FeaturesPageClient() {
  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent('Platform customization inquiry')}`;

  return (
    <main className="features-page" data-testid="features-page">
      <header className="features-hero">
        <p className="ds-label features-hero__eyebrow">Platform overview</p>
        <h1 className="ds-display ds-display--xl features-hero__title">Studio</h1>
        <p className="ds-body features-hero__lead">
          Everything included in this ecommerce platform — shopper experience and
          owner tools, ready to brand as your own.
        </p>
        <div className="features-hero__actions">
          <Link href="/shop" className="ds-btn ds-btn--primary ds-btn--lg">
            Browse the demo shop
          </Link>
          <a href="#contact" className="ds-btn ds-btn--secondary ds-btn--lg">
            Talk about a build
          </a>
        </div>
      </header>

      <nav className="features-jump" aria-label="Feature groups">
        <a href="#customer" className="features-jump__link">
          Customer experience
        </a>
        <a href="#admin" className="features-jump__link">
          Business &amp; admin
        </a>
      </nav>

      <section id="customer" className="features-section" aria-labelledby="customer-heading">
        <div className="features-section__intro">
          <h2 id="customer-heading" className="ds-display ds-display--md">
            Customer experience
          </h2>
          <p className="ds-body">
            Storefront tools that help shoppers discover, decide, and buy with confidence.
          </p>
        </div>
        <ul className="features-grid">
          {CUSTOMER.map((f) => (
            <li key={f.title} className="features-card">
              <span className="features-card__icon" aria-hidden="true">
                <FeatureIcon name={f.icon} />
              </span>
              <h3 className="ds-display ds-display--sm features-card__title">{f.title}</h3>
              <p className="ds-body--sm features-card__body">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="admin" className="features-section features-section--alt" aria-labelledby="admin-heading">
        <div className="features-section__intro">
          <h2 id="admin-heading" className="ds-display ds-display--md">
            Business &amp; admin tools
          </h2>
          <p className="ds-body">
            Operate catalog, orders, content, and AI from a single admin surface.
          </p>
        </div>
        <ul className="features-grid">
          {ADMIN.map((f) => (
            <li key={f.title} className="features-card">
              <span className="features-card__icon" aria-hidden="true">
                <FeatureIcon name={f.icon} />
              </span>
              <h3 className="ds-display ds-display--sm features-card__title">{f.title}</h3>
              <p className="ds-body--sm features-card__body">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="contact" className="features-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="ds-display ds-display--md">
          Want this tailored to your brand?
        </h2>
        <p className="ds-body features-cta__lead">
          This page only ships in demo builds. For a production storefront, we
          customize branding, catalog, and integrations — without this notice.
        </p>
        <div className="features-cta__contacts">
          <a className="features-cta__email" href={mailto} data-testid="features-contact-email">
            {EMAIL}
          </a>
          <a className="features-cta__phone" href={`tel:${PHONE}`} data-testid="features-contact-phone">
            {PHONE}
          </a>
        </div>
        <Link href="/" className="ds-btn ds-btn--primary ds-btn--lg">
          Back to the storefront
        </Link>
      </section>
    </main>
  );
}

function FeatureIcon({ name }: { name: Feature['icon'] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  } as const;
  switch (name) {
    case 'search':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" strokeLinecap="round" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case 'bag':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M5 6h14v9H9l-4 3V6z" strokeLinejoin="round" />
        </svg>
      );
    case 'tryon':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
          <path d="M16 4l2 2-2 2M8 4L6 6l2 2" strokeLinecap="round" />
        </svg>
      );
    case 'reel':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="12" cy="12" r="3" />
          <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'ticker':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 12h16M4 7h10M4 17h13" strokeLinecap="round" />
        </svg>
      );
    case 'blog':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 5h12v14H6z" />
          <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="1" />
          <path d="m4 8 8 6 8-6" strokeLinecap="round" />
        </svg>
      );
    case 'device':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" strokeLinecap="round" />
        </svg>
      );
    case 'box':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" strokeLinejoin="round" />
          <path d="M4 8l8 4 8-4M12 12v8" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="8" r="2.5" />
          <path d="M3 19c.8-3 3-4.5 6-4.5" strokeLinecap="round" />
          <circle cx="16.5" cy="9" r="2" />
          <path d="M14 19c.6-2.2 2-3.5 4.5-3.5.8 0 1.5.1 2.2.4" strokeLinecap="round" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 19V5M4 19h16" strokeLinecap="round" />
          <path d="M8 15v-4M12 15V8M16 15v-7" strokeLinecap="round" />
        </svg>
      );
    case 'tag':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 12l9-9h6v6l-9 9-6-6z" strokeLinejoin="round" />
          <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 10v4l3 1v2l3-2 7 3V6L10 9 4 10z" strokeLinejoin="round" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 16h12l-1-6a5 5 0 0 0-10 0l-1 6z" strokeLinejoin="round" />
          <path d="M10 18a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
      );
    case 'export':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 4v10M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 16v3h14v-3" strokeLinecap="round" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="6" y="11" width="12" height="9" rx="1" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    default:
      return null;
  }
}
