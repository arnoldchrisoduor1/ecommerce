'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import { ViewerBadge } from '@/components/product/ViewerBadge';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductPresenceProvider } from '@/components/product/ProductPresenceProvider';
import { TryWithAI } from '@/components/product/TryWithAI';
import { useCart } from '@/components/cart/CartProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import type { ProductDetail, ProductListItem, ProductReview } from '@/lib/api';
import { formatKes } from '@/lib/format';
import { notifyWishlistChanged } from '@/lib/account';

type Props = {
  product: ProductDetail;
  related: ProductListItem[];
  reviews: ProductReview[];
};

export function PdpClient({ product, related, reviews }: Props) {
  const { addToCart } = useCart();
  const { user, accessToken, authFetch, requireAuth, ready } = useAuth();
  const sizes = useMemo(
    () => [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[],
    [product.variants],
  );
  const colors = useMemo(
    () => [...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[],
    [product.variants],
  );

  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [color, setColor] = useState<string | null>(colors[0] ?? null);
  const [imageIdx, setImageIdx] = useState(0);

  const defaultImages = useMemo(() => {
    const general = product.images.filter((img) => !img.variant_id);
    return general.length > 0 ? general : product.images;
  }, [product.images]);

  const selected = product.variants.find((v) => {
    const sizeOk = size == null || v.size === size;
    const colorOk = color == null || v.color === color;
    return sizeOk && colorOk;
  });

  const galleryImages = useMemo(() => {
    if (defaultImages.length === 0) {
      return [{ id: 'ph', url: '/media/product.svg', position: 0 }];
    }
    if (!selected) return defaultImages;
    const variantImg = product.images.find((img) => img.variant_id === selected.id);
    if (!variantImg) return defaultImages;
    const rest = defaultImages.filter((img) => img.id !== variantImg.id);
    return [variantImg, ...rest];
  }, [defaultImages, product.images, selected]);

  useEffect(() => {
    setImageIdx(0);
  }, [selected?.id]);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !user || !accessToken) {
      setWishlisted(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const res = await authFetch<{ items: { id: string }[] }>('/account/wishlist');
        if (!cancelled) {
          setWishlisted(res.items.some((i) => i.id === product.id));
        }
      } catch {
        /* ignore */
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [ready, user, accessToken, product.id, authFetch]);

  async function toggleWishlist() {
    if (wishlisted) {
      if (!requireAuth({ type: 'wishlist_remove', productId: product.id })) return;
    } else if (!requireAuth({ type: 'wishlist_add', productId: product.id })) {
      return;
    }
    setBusy(true);
    try {
      if (wishlisted) {
        await authFetch(`/account/wishlist/${product.id}`, { method: 'DELETE' });
        setWishlisted(false);
      } else {
        await authFetch(`/account/wishlist/${product.id}`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        setWishlisted(true);
      }
      notifyWishlistChanged();
    } catch {
      setError('Could not update wishlist');
    } finally {
      setBusy(false);
    }
  }

  function sizeAvailable(s: string) {
    return product.variants.some((v) => {
      if (v.size !== s) return false;
      if (color != null && v.color !== color) return false;
      return v.stock_qty > 0;
    });
  }

  function colorAvailable(c: string) {
    return product.variants.some((v) => {
      if (v.color !== c) return false;
      if (size != null && v.size !== size) return false;
      return v.stock_qty > 0;
    });
  }

  const price =
    selected?.price_override ??
    product.sale_price ??
    product.base_price;
  const onSale =
    product.sale_price != null && product.sale_price < product.base_price;
  async function onAdd() {
    setError('');
    if (!selected) {
      setError('Select a size');
      return;
    }
    if (selected.stock_qty <= 0) {
      setError('Sold out');
      return;
    }
    setBusy(true);
    try {
      await addToCart(selected.id, 1);
    } catch {
      setError('Could not add to bag');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pdp">
      <div className="pdp__gallery" data-testid="pdp-gallery">
        <div className="pdp__stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="pdp__image"
            src={galleryImages[imageIdx]?.url}
            alt={product.name}
            decoding="async"
          />
          <ViewerBadge
            productId={product.id}
            testId="pdp-viewer-count-badge"
            showHighDemand
            heartbeat
            overlay
          />
        </div>
        {galleryImages.length > 1 ? (
          <div className="pdp__thumbs">
            {galleryImages.map((img, i) => (
              <button
                key={img.id}
                type="button"
                className={`pdp__thumb ${i === imageIdx ? 'pdp__thumb--active' : ''}`}
                onClick={() => setImageIdx(i)}
                aria-label={`Image ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pdp__info">
        <p className="ds-label pdp__eyebrow">{product.category?.name ?? 'Shop'}</p>
        <h1 className="ds-display ds-display--sm pdp__title">{product.name}</h1>
        <p className="ds-body pdp__price">
          {onSale ? (
            <>
              <span className="product-card__sale">{formatKes(price)}</span>{' '}
              <span className="product-card__was ds-caption">
                {formatKes(product.base_price)}
              </span>
            </>
          ) : (
            formatKes(price)
          )}
        </p>

        {sizes.length > 0 ? (
          <div className="pdp__variants">
            <div className="pdp__variant-head">
              <span className="ds-label">Size</span>
              <button
                type="button"
                className="ds-btn ds-btn--ghost ds-btn--sm"
                data-testid="size-chart-trigger"
                onClick={() => setSizeChartOpen(true)}
              >
                Size chart
              </button>
            </div>
            <div className="pdp__swatches" data-testid="size-selector">
              {sizes.map((s) => {
                const available = sizeAvailable(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`pdp__swatch ${size === s ? 'pdp__swatch--active' : ''} ${!available ? 'pdp__swatch--oos' : ''}`}
                    onClick={() => setSize(s)}
                    aria-disabled={!available}
                    title={!available ? 'Out of stock' : undefined}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {colors.length > 0 ? (
          <div className="pdp__variants" data-testid="color-selector">
            <span className="ds-label">Color</span>
            <div className="pdp__swatches">
              {colors.map((c) => {
                const available = colorAvailable(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`pdp__swatch ${color === c ? 'pdp__swatch--active' : ''} ${!available ? 'pdp__swatch--oos' : ''}`}
                    onClick={() => setColor(c)}
                    aria-disabled={!available}
                    title={!available ? 'Out of stock' : undefined}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {selected ? (
          <p className="ds-caption">
            {selected.stock_qty <= 0 ? (
              <Badge variant="stock-out">Sold out</Badge>
            ) : selected.stock_qty <= selected.low_stock_threshold ? (
              <Badge variant="stock-low">Low stock</Badge>
            ) : (
              <Badge variant="stock-ok">In stock</Badge>
            )}
          </p>
        ) : null}

        {!product.is_bundle ? (
          <TryWithAI productId={product.id} productName={product.name} />
        ) : null}

        <div className="pdp__actions">
          <Button
            variant="primary"
            size="lg"
            data-testid="add-to-bag"
            disabled={busy}
            onClick={() => void onAdd()}
          >
            Add to bag
          </Button>
          <Button
            variant="secondary"
            size="lg"
            data-testid="wishlist-toggle"
            disabled={busy}
            onClick={() => void toggleWishlist()}
          >
            {wishlisted ? 'Saved' : 'Save'}
          </Button>
        </div>
        {error ? (
          <p className="ds-caption email-capture__error" role="alert">
            {error}
          </p>
        ) : null}

        {product.description ? (
          <p className="ds-body pdp__desc">{product.description}</p>
        ) : null}

        <ul className="pdp__trust ds-caption">
          <li>Secure checkout</li>
          <li>14-day returns</li>
          <li>Delivery with named courier</li>
          <li>M-Pesa · Card</li>
        </ul>
      </div>

      {reviews.length > 0 ? (
        <section className="pdp__reviews" aria-labelledby="pdp-reviews-heading">
          <h2 id="pdp-reviews-heading" className="ds-display ds-display--md">
            Reviews
          </h2>
          <ul className="reviews-feat__list">
            {reviews.map((r) => (
              <li key={r.id} className="reviews-feat__item">
                <p className="ds-label reviews-feat__rating">{'★'.repeat(r.rating)}</p>
                <p className="ds-body reviews-feat__body">{r.body ?? ''}</p>
                <p className="ds-caption">{r.customer_name}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="pdp__related" aria-labelledby="related-heading">
          <h2 id="related-heading" className="ds-display ds-display--md">
            Complete the look
          </h2>
          <ProductPresenceProvider productIds={related.map((p) => p.id)}>
            <div className="shelf__grid">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </ProductPresenceProvider>
        </section>
      ) : null}

      <Modal
        open={sizeChartOpen}
        onClose={() => setSizeChartOpen(false)}
        title="Size chart"
        data-testid="size-chart-modal"
      >
        <table className="size-chart ds-body--sm">
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">Bust</th>
              <th scope="col">Waist</th>
              <th scope="col">Hip</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>XS</td>
              <td>78–82</td>
              <td>60–64</td>
              <td>86–90</td>
            </tr>
            <tr>
              <td>S</td>
              <td>82–86</td>
              <td>64–68</td>
              <td>90–94</td>
            </tr>
            <tr>
              <td>M</td>
              <td>86–90</td>
              <td>68–72</td>
              <td>94–98</td>
            </tr>
            <tr>
              <td>L</td>
              <td>90–96</td>
              <td>72–78</td>
              <td>98–104</td>
            </tr>
          </tbody>
        </table>
        <p className="ds-caption">Measurements in cm.</p>
        <Button variant="secondary" size="md" onClick={() => setSizeChartOpen(false)}>
          Close
        </Button>
      </Modal>
    </div>
  );
}
