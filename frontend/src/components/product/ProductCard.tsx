'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, CardBody, CardMedia, Modal } from '@/components/ui';
import { ViewerBadge } from '@/components/product/ViewerBadge';
import type { ProductListItem } from '@/lib/api';
import { formatKes } from '@/lib/format';

type Props = {
  product: ProductListItem;
  showQuickView?: boolean;
  showViewer?: boolean;
};

export function ProductCard({
  product,
  showQuickView = false,
  showViewer = false,
}: Props) {
  const [quickOpen, setQuickOpen] = useState(false);
  const price = product.sale_price ?? product.base_price;
  const onSale =
    product.sale_price != null && product.sale_price < product.base_price;
  const href = product.is_bundle
    ? `/bundles/${product.slug}`
    : `/product/${product.slug}`;

  return (
    <div className="product-card-wrap">
      <Card variant="product" className="product-card">
        <Link href={href} className="product-card__link" data-testid="product-card">
          <CardMedia>
            {product.primary_image?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.primary_image.url}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="product-card__placeholder" aria-hidden="true" />
            )}
            {onSale ? (
              <span className="product-card__badge">
                <Badge variant="sale">Sale</Badge>
              </span>
            ) : null}
            {product.is_bundle ? (
              <span className="product-card__badge product-card__badge--bundle">
                <Badge variant="accent">Bundle</Badge>
              </span>
            ) : null}
          </CardMedia>
          <CardBody>
            <span className="ds-display ds-display--sm product-card__name">
              {product.name}
            </span>
            <span className="ds-body product-card__price">
              {onSale ? (
                <>
                  <span className="product-card__sale">{formatKes(price)}</span>
                  <span className="product-card__was ds-caption">
                    {formatKes(product.base_price)}
                  </span>
                </>
              ) : (
                formatKes(price)
              )}
            </span>
            {showViewer ? <ViewerBadge productId={product.id} /> : null}
          </CardBody>
        </Link>
      </Card>

      {showQuickView ? (
        <button
          type="button"
          className="ds-btn ds-btn--secondary ds-btn--sm product-card__quick"
          data-testid="quick-view-trigger"
          onClick={() => setQuickOpen(true)}
        >
          Quick view
        </button>
      ) : null}

      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title={product.name}
        panelClassName="ds-modal__panel--quick"
        data-testid="quick-view-modal"
      >
        <div className="quick-view">
          {product.primary_image?.url ? (
            <div className="quick-view__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.primary_image.url}
                alt=""
                className="quick-view__img"
                decoding="async"
              />
            </div>
          ) : (
            <div className="quick-view__media quick-view__media--empty" aria-hidden="true" />
          )}
          <div className="quick-view__meta">
            <p className="ds-body quick-view__price">
              {onSale ? (
                <>
                  <span className="product-card__sale">{formatKes(price)}</span>
                  <span className="product-card__was ds-caption">
                    {formatKes(product.base_price)}
                  </span>
                </>
              ) : (
                formatKes(price)
              )}
            </p>
            {product.variants?.length ? (
              <p className="ds-caption quick-view__hint">
                {product.variants.length} option
                {product.variants.length === 1 ? '' : 's'} on full page
              </p>
            ) : null}
            <div className="quick-view__actions">
              <Link
                href={href}
                className="ds-btn ds-btn--primary ds-btn--md quick-view__cta"
                onClick={() => setQuickOpen(false)}
              >
                View product
              </Link>
              <button
                type="button"
                className="ds-btn ds-btn--ghost ds-btn--md quick-view__cta"
                onClick={() => setQuickOpen(false)}
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
