import { notFound } from 'next/navigation';
import Link from 'next/link';
import { apiGet, type BundleDetail } from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { formatKes } from '@/lib/format';
import '../../landing.css';
import '../../catalog.css';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export default async function BundlePage({ params }: { params: Params }) {
  const { slug } = await params;
  let bundle: BundleDetail;
  try {
    bundle = await apiGet<BundleDetail>(`/catalog/bundles/${slug}`);
  } catch {
    notFound();
  }

  const price = bundle.sale_price ?? bundle.base_price;

  return (
    <StoreChrome>
      <main className="catalog-page bundle-page">
        <p className="ds-label">Bundle</p>
        <h1 className="ds-display ds-display--sm">{bundle.name}</h1>
        <p className="ds-body" data-testid="bundle-price">
          {formatKes(price)}
        </p>
        {bundle.description ? (
          <p className="ds-body--sm">{bundle.description}</p>
        ) : null}

        <h2 className="ds-display ds-display--md">Included</h2>
        <ul className="bundle-components">
          {bundle.components.map((c) => (
            <li
              key={c.product_id}
              className="bundle-components__item"
              data-testid="bundle-component-item"
            >
              <Link href={`/product/${c.slug}`} className="ds-display ds-display--sm">
                {c.name}
              </Link>
              <span className="ds-caption">×{c.quantity}</span>
              <span className="ds-body--sm">
                {formatKes(c.sale_price ?? c.base_price)}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </StoreChrome>
  );
}
