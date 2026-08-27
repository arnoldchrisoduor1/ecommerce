'use client';

import { useState, type CSSProperties } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardMedia,
  CardTitle,
  Modal,
} from '@/components/ui';

const pageStyle: CSSProperties = {
  maxWidth: 'var(--container-max)',
  margin: '0 auto',
  padding: 'var(--space-8) var(--grid-margin) var(--space-16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-12)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(var(--size-card-min), 1fr))',
  gap: 'var(--space-6)',
};

export default function StyleGuidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  return (
    <main style={pageStyle}>
      <header>
        <p className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Temporary
        </p>
        <h1 className="ds-display ds-display--lg" style={{ margin: 'var(--space-2) 0' }}>
          Style guide
        </h1>
        <p className="ds-body" style={{ margin: 0, color: 'var(--color-fg-muted)' }}>
          Base components wired to design-system tokens. Confirm visually against
          components.css before building real pages.
        </p>
      </header>

      <section style={sectionStyle} aria-labelledby="type-heading">
        <h2 id="type-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Typography
        </h2>
        <p className="ds-display ds-display--xl" style={{ margin: 0 }}>
          New Season, New Drop
        </p>
        <p className="ds-display ds-display--sm" style={{ margin: 0 }}>
          Long Sleeved Tees - Heavy Cotton
        </p>
        <p className="ds-body" style={{ margin: 0 }}>
          Body — Montserrat at --font-body. Cormorant for display only.
        </p>
        <p className="ds-label" style={{ margin: 0 }}>
          Label tracking
        </p>
      </section>

      <section style={sectionStyle} aria-labelledby="btn-heading">
        <h2 id="btn-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Buttons
        </h2>
        <div style={rowStyle}>
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div style={rowStyle}>
          <Button size="sm" variant="primary">
            Small
          </Button>
          <Button size="md" variant="primary">
            Medium
          </Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section style={sectionStyle} aria-labelledby="badge-heading">
        <h2 id="badge-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Badges
        </h2>
        <div style={rowStyle}>
          <Badge variant="sale">Sale</Badge>
          <Badge variant="accent">New</Badge>
          <Badge variant="stock-ok">In stock</Badge>
          <Badge variant="stock-low">Low stock</Badge>
          <Badge variant="stock-out">Sold out</Badge>
          <Badge variant="success">Paid</Badge>
          <Badge variant="danger">Error</Badge>
          <Badge variant="neutral">Draft</Badge>
          <Badge variant="presence">3 viewing</Badge>
        </div>
      </section>

      <section style={sectionStyle} aria-labelledby="card-heading">
        <h2 id="card-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Cards
        </h2>
        <div style={gridStyle}>
          <Card variant="product" data-testid="style-guide-product-card">
            <CardMedia
              style={{
                background: 'var(--color-bg-subtle)',
                minHeight: 'var(--space-24)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="ds-caption">Photo</span>
            </CardMedia>
            <CardBody>
              <span className="ds-display ds-display--sm">Silk Tank Top</span>
              <span className="ds-body--sm">KES 1,290</span>
              <Badge variant="presence">2 viewing</Badge>
            </CardBody>
          </Card>
          <Card variant="panel" data-testid="style-guide-panel-card">
            <CardTitle>Panel card</CardTitle>
            <p className="ds-body--sm" style={{ margin: 0 }}>
              Hairline border, density-aware padding. Used for admin panels and forms.
            </p>
          </Card>
        </div>
      </section>

      <section style={sectionStyle} aria-labelledby="modal-heading">
        <h2 id="modal-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Modals
        </h2>
        <div style={rowStyle}>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open default modal
          </Button>
          <Button variant="accent" onClick={() => setOfferOpen(true)}>
            Open offer modal
          </Button>
        </div>
      </section>

      <section style={sectionStyle} data-density="admin" aria-labelledby="admin-heading">
        <h2 id="admin-heading" className="ds-label" style={{ color: 'var(--color-fg-muted)', margin: 0 }}>
          Admin density
        </h2>
        <Card variant="panel">
          <CardTitle>Denser register</CardTitle>
          <div style={rowStyle}>
            <Button size="sm" variant="primary">
              Save
            </Button>
            <Button size="md" variant="secondary">
              Cancel
            </Button>
            <Badge variant="stock-low">Low stock</Badge>
          </div>
        </Card>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Default modal"
        data-testid="style-guide-modal"
      >
        <p className="ds-body" style={{ margin: 0 }}>
          Scrim dismiss + Escape. Focus ring uses --focus-ring token.
        </p>
        <Button variant="primary" size="md" onClick={() => setModalOpen(false)}>
          Done
        </Button>
      </Modal>

      <Modal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        offer
        eyebrow="Welcome offer"
        title="10% off your first order"
        code="WELCOME10"
        claimsLabel="47 claimed today"
        data-testid="style-guide-offer-modal"
      >
        <Button variant="accent" size="lg">
          Claim code
        </Button>
      </Modal>
    </main>
  );
}
