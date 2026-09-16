'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { apiGet, type ProductListItem } from '@/lib/api';
import { formatKes } from '@/lib/format';

const DEBOUNCE_MS = 250;

export function NavSearch() {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [panelOpen, setPanelOpen] = useState(false);

  const close = useCallback(() => {
    setPanelOpen(false);
    setOpen(false);
    setQuery('');
    setResults([]);
    setActiveIdx(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!panelOpen) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPanelOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [panelOpen]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setActiveIdx(-1);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await apiGet<{ products: ProductListItem[] }>(
          `/products/search?q=${encodeURIComponent(q)}&limit=5`,
        );
        setResults(res.products ?? []);
        setActiveIdx(-1);
        setPanelOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  function goSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    close();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!results.length) return;
      setPanelOpen(true);
      setActiveIdx((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      setPanelOpen(true);
      setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        const p = results[activeIdx];
        close();
        router.push(
          p.is_bundle ? `/bundles/${p.slug}` : `/product/${p.slug}`,
        );
        return;
      }
      goSearch(query);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="main-nav__icon"
        aria-label="Search"
        data-testid="nav-search-open"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </button>
    );
  }

  return (
    <div className="nav-search" ref={rootRef} data-testid="nav-search">
      <div className="nav-search__field">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          className="nav-search__input ds-body--sm"
          placeholder="Search products…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPanelOpen(true);
          }}
          onFocus={() => setPanelOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={panelOpen && (loading || results.length > 0 || query.trim().length > 0)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined
          }
          autoComplete="off"
          data-testid="nav-search-input"
        />
        <button
          type="button"
          className="nav-search__close ds-caption"
          aria-label="Close search"
          onClick={close}
        >
          Esc
        </button>
      </div>

      {panelOpen && query.trim() ? (
        <div
          className="nav-search__dropdown"
          role="listbox"
          id={listId}
          data-testid="nav-search-dropdown"
        >
          {loading ? (
            <p className="nav-search__status ds-caption">Searching…</p>
          ) : results.length === 0 ? (
            <p className="nav-search__status ds-caption">No matches</p>
          ) : (
            results.map((p, i) => {
              const price = p.sale_price ?? p.base_price;
              const href = p.is_bundle
                ? `/bundles/${p.slug}`
                : `/product/${p.slug}`;
              return (
                <Link
                  key={p.id}
                  id={`${listId}-opt-${i}`}
                  href={href}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`nav-search__hit${i === activeIdx ? ' nav-search__hit--active' : ''}`}
                  onClick={close}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="nav-search__thumb" aria-hidden="true">
                    {p.primary_image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.primary_image.url} alt="" />
                    ) : null}
                  </span>
                  <span className="nav-search__meta">
                    <span className="ds-body--sm nav-search__name">{p.name}</span>
                    <span className="ds-caption">{formatKes(price)}</span>
                  </span>
                </Link>
              );
            })
          )}
          {!loading && query.trim() ? (
            <button
              type="button"
              className="nav-search__all ds-label"
              onClick={() => goSearch(query)}
            >
              View all results
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
