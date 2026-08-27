import { notFound } from 'next/navigation';
import {
  apiGet,
  type ProductDetail,
  type ProductListItem,
  type ProductReview,
} from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { PdpClient } from '@/components/product/PdpClient';
import '../../landing.css';
import '../../catalog.css';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;

  let product: ProductDetail;
  try {
    product = await apiGet<ProductDetail>(`/catalog/products/${slug}`);
  } catch {
    notFound();
  }

  if (product.is_bundle) {
    notFound();
  }

  let related: ProductListItem[] = [];
  let reviews: ProductReview[] = [];
  try {
    const [rel, rev] = await Promise.all([
      apiGet<{ products: ProductListItem[] }>(`/catalog/products/${slug}/related`),
      apiGet<{ reviews: ProductReview[] }>(`/reviews/product/${product.id}`),
    ]);
    related = rel.products ?? [];
    reviews = rev.reviews ?? [];
  } catch {
    /* optional */
  }

  return (
    <StoreChrome>
      <main className="catalog-page">
        <PdpClient product={product} related={related} reviews={reviews} />
      </main>
    </StoreChrome>
  );
}
