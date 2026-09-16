'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ProductCard } from '@/components/product/ProductCard';
import { apiGet, type Category, type ProductListItem } from '@/lib/api';

const SUGGESTED = [
  { label: 'Tees', slug: 'tees' },
  { label: 'Tanks', slug: 'tanks' },
  { label: 'Bodysuits', slug: 'bodysuits' },
  { label: 'Knitwear', slug: 'knitwear' },
];

type Props = {
  initialQuery: string;
  initialProducts: ProductListItem[];
  initialTotal: number;
  categories: Category[];
};

export function SearchClient({
  initialQuery,
  initialProducts,
  initialTotal,
  categories,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const q = searchParams.get('q') ?? initialQuery;
  const page = Number(searchParams.get('page') || '1') || 1;
  const [input, setInput] = useState(q);
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const bootstrapped = useRef(false);

  const suggestions =
    categories.length >= 3
      ? categories.slice(0, 4).map((c) => ({ label: c.name, slug: c.slug }))
      : SUGGESTED;

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!q.trim()) {
        setProducts([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      const skipLoading =
        !bootstrapped.current &&
        q === initialQuery &&
        page === 1 &&
        initialProducts.length > 0;
      bootstrapped.current = true;
      if (!skipLoading) setLoading(true);
      try {
        const res = await apiGet<{
          products: ProductListItem[];
          total_count: number;
        }>(
          `/products/search?q=${encodeURIComponent(q.trim())}&page=${page}&limit=24`,
        );
        if (!cancelled) {
          setProducts(res.products ?? []);
          setTotal(res.total_count ?? 0);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [q, page, initialQuery, initialProducts.length]);

  function submit(nextQ: string) {
    const trimmed = nextQ.trim();
    startTransition(() => {
      if (!trimmed) {
        router.push('/search');
        return;
      }
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    });
  }

  const showEmpty = !loading && q.trim() && total === 0;
  const showIdle = !q.trim();

  return (
    <div className={`search-page ${pending ? 'search-page--pending' : ''}`}>
      <header className="search-page__header">
        <h1 className="ds-display ds-display--lg">Search</h1>
        <form
          className="search-page__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          role="search"
        >
          <label className="search-page__label">
            <span className="ds-label">Find products</span>
            <input
              type="search"
              className="search-page__input ds-body"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by name or description…"
              data-testid="search-page-input"
              autoFocus
            />
          </label>
          <button type="submit" className="ds-btn ds-btn--primary ds-btn--md">
            Search
          </button>
        </form>
        {q.trim() && !loading ? (
          <p className="ds-body search-page__count" data-testid="search-result-count">
            {total === 0
              ? `No products match “${q.trim()}”`
              : `${total} result${total === 1 ? '' : 's'} for “${q.trim()}”`}
          </p>
        ) : null}
      </header>

      {loading || (q.trim() && products.length === 0 && !showEmpty) ? (
        <div className="search-page__skeleton shelf__grid" aria-busy="true" aria-label="Loading results">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="search-skel" />
          ))}
        </div>
      ) : null}

      {showIdle ? (
        <div className="search-page__empty">
          <p className="ds-body">Start typing to find pieces across the catalogue.</p>
          <div className="search-page__suggest">
            {suggestions.map((s) => (
              <Link
                key={s.slug}
                href={`/shop?category=${s.slug}`}
                className="ds-btn ds-btn--secondary ds-btn--sm"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="search-page__empty" data-testid="search-empty">
          <p className="ds-body">
            No products match “{q.trim()}”. Try a category instead.
          </p>
          <div className="search-page__suggest">
            {suggestions.map((s) => (
              <Link
                key={s.slug}
                href={`/shop?category=${s.slug}`}
                className="ds-btn ds-btn--secondary ds-btn--sm"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="shelf__grid" data-testid="search-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} showQuickView />
          ))}
        </div>
      ) : null}
    </div>
  );
}
