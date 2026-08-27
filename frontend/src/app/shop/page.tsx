import { Suspense } from 'react';
import { apiGet, SORT_API, type Category, type ProductListItem } from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { ShopClient } from '@/components/shop/ShopClient';
import '../landing.css';
import '../catalog.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sortUi = typeof sp.sort === 'string' ? sp.sort : 'recommended';
  const category = typeof sp.category === 'string' ? sp.category : '';
  const page = Number(typeof sp.page === 'string' ? sp.page : '1') || 1;
  const pageSize = 12;
  const apiSort = SORT_API[sortUi] || 'recommended';

  const q = new URLSearchParams({
    sort: apiSort,
    page: String(page),
    page_size: String(pageSize),
  });
  if (category) q.set('category', category);

  let products: ProductListItem[] = [];
  let total = 0;
  let categories: Category[] = [];

  try {
    const [catalog, cats] = await Promise.all([
      apiGet<{ products: ProductListItem[]; total_count: number }>(
        `/catalog/products?${q}`,
      ),
      apiGet<{ categories: Category[] }>('/catalog/categories'),
    ]);
    products = catalog.products;
    total = catalog.total_count;
    categories = cats.categories;
  } catch {
    /* empty shop */
  }

  return (
    <StoreChrome>
      <main className="catalog-page">
        <Suspense fallback={<p className="ds-body">Loading shop…</p>}>
          <ShopClient
            initialProducts={products}
            initialTotal={total}
            categories={categories}
            initialSort={sortUi}
            initialCategory={category}
            initialPage={page}
            pageSize={pageSize}
          />
        </Suspense>
      </main>
    </StoreChrome>
  );
}
