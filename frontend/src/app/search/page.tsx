import { Suspense } from 'react';
import { apiGet, type Category, type ProductListItem } from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { SearchClient } from '@/components/search/SearchClient';
import '../landing.css';
import '../catalog.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Number(typeof sp.page === 'string' ? sp.page : '1') || 1;

  let products: ProductListItem[] = [];
  let total = 0;
  let categories: Category[] = [];

  try {
    const catsPromise = apiGet<{ categories: Category[] }>('/catalog/categories');
    if (q.trim()) {
      const [catalog, cats] = await Promise.all([
        apiGet<{ products: ProductListItem[]; total_count: number }>(
          `/products/search?q=${encodeURIComponent(q.trim())}&page=${page}&limit=24`,
        ),
        catsPromise,
      ]);
      products = catalog.products ?? [];
      total = catalog.total_count ?? 0;
      categories = cats.categories ?? [];
    } else {
      const cats = await catsPromise;
      categories = cats.categories ?? [];
    }
  } catch {
    /* empty search */
  }

  return (
    <StoreChrome>
      <main className="catalog-page">
        <Suspense
          fallback={
            <div className="search-page__skeleton shelf__grid" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="search-skel" />
              ))}
            </div>
          }
        >
          <SearchClient
            initialQuery={q}
            initialProducts={products}
            initialTotal={total}
            categories={categories}
          />
        </Suspense>
      </main>
    </StoreChrome>
  );
}
