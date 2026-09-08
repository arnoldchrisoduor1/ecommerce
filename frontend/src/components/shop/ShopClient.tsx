'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { ProductCard } from '@/components/product/ProductCard';
import {
  SORT_API,
  apiGet,
  type Category,
  type ProductListItem,
} from '@/lib/api';

type Props = {
  initialProducts: ProductListItem[];
  initialTotal: number;
  categories: Category[];
  initialSort: string;
  initialCategory: string;
  initialPage: number;
  pageSize: number;
};

export function ShopClient({
  initialProducts,
  initialTotal,
  categories,
  initialSort,
  initialCategory,
  initialPage,
  pageSize,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);

  const sort = searchParams.get('sort') || initialSort;
  const category = searchParams.get('category') || initialCategory;
  const page = Number(searchParams.get('page') || initialPage);

  const syncUrl = useCallback(
    (next: { sort?: string; category?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      const s = next.sort ?? sort;
      const c = next.category ?? category;
      const p = next.page ?? page;
      if (s) params.set('sort', s);
      else params.delete('sort');
      if (c) params.set('category', c);
      else params.delete('category');
      if (p > 1) params.set('page', String(p));
      else params.delete('page');
      startTransition(() => {
        router.push(`/shop?${params.toString()}`);
      });
    },
    [router, searchParams, sort, category, page],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const apiSort = SORT_API[sort] || 'recommended';
      const q = new URLSearchParams({
        sort: apiSort,
        page: String(page),
        page_size: String(pageSize),
      });
      if (category) q.set('category', category);
      try {
        const res = await apiGet<{
          products: ProductListItem[];
          total_count: number;
        }>(`/catalog/products?${q}`);
        if (!cancelled) {
          setProducts(res.products);
          setTotal(res.total_count);
        }
      } catch {
        /* keep previous */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sort, category, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const ordered = [...products].sort((a, b) => Number(a.is_bundle) - Number(b.is_bundle));

  return (
    <div className={`shop ${pending ? 'shop--pending' : ''}`}>
      <header className="shop__header">
        <h1 className="ds-display ds-display--lg">Shop</h1>
        <div className="shop__controls">
          <label className="shop__control">
            <span className="ds-label">Category</span>
            <select
              className="shop__select ds-body--sm"
              value={category}
              onChange={(e) => syncUrl({ category: e.target.value, page: 1 })}
              data-testid="category-select"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="shop__control">
            <span className="ds-label">Sort</span>
            <select
              className="shop__select ds-body--sm"
              value={sort}
              onChange={(e) => syncUrl({ sort: e.target.value, page: 1 })}
              data-testid="sort-select"
            >
              <option value="recommended">Recommended</option>
              <option value="latest">Latest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </header>

      <div className="shelf__grid" data-testid="shop-grid">
        {ordered.map((p) => (
          <ProductCard key={p.id} product={p} showQuickView showViewer />
        ))}
      </div>

      {totalPages > 1 ? (
        <nav className="shop__pagination" aria-label="Pagination">
          <button
            type="button"
            className="ds-btn ds-btn--secondary ds-btn--sm"
            disabled={page <= 1}
            onClick={() => syncUrl({ page: page - 1 })}
          >
            Previous
          </button>
          <span className="ds-caption">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="ds-btn ds-btn--secondary ds-btn--sm"
            disabled={page >= totalPages}
            onClick={() => syncUrl({ page: page + 1 })}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
