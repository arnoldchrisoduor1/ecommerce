/**
 * Storefront API helpers.
 * Browser calls go through Next rewrites (/api → backend).
 * Server components hit the backend origin directly.
 */

import { defaultHeroCrop, normalizeCrop, type HeroCrop } from '@/lib/heroCrop';

export type { HeroCrop };

const serverOrigin =
  process.env.API_URL?.replace(/\/$/, '') || 'http://localhost:8081';

function apiBase(): string {
  if (typeof window === 'undefined') {
    return `${serverOrigin}/api`;
  }
  return '/api';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const isServer = typeof window === 'undefined';
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    ...(isServer
      ? { cache: 'no-store' as RequestCache }
      : {}),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${method} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ProductVariant = {
  id: string;
  sku: string;
  size?: string | null;
  color?: string | null;
  stock_qty: number;
  price_override?: number | null;
  low_stock_threshold: number;
};

export type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  material?: string | null;
  base_price: number;
  sale_price?: number | null;
  is_bundle: boolean;
  category?: Category | null;
  variants: ProductVariant[];
  images: ProductImage[];
};

export type BundleDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  base_price: number;
  sale_price?: number | null;
  components: {
    product_id: string;
    name: string;
    slug: string;
    base_price: number;
    sale_price?: number | null;
    quantity: number;
  }[];
};

export type CartItem = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sku: string;
  size?: string | null;
  color?: string | null;
  product_id: string;
  product_name: string;
  product_slug: string;
};

export type Cart = {
  id: string;
  items: CartItem[];
  subtotal: number;
  item_count: number;
};

export type ProductReview = FeaturedReview;

/** UI sort values (e2e) → API sort query */
export const SORT_API: Record<string, string> = {
  recommended: 'recommended',
  latest: 'latest',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc',
  random: 'random',
};

export type ContentBlock<T> = {
  key: string;
  data: T;
  is_active: boolean;
  updated_at: string;
};

export type HeroSlide = {
  url: string;
  /** Horizontal focal point 0–1 (legacy fallback). */
  focal_x?: number;
  /** Vertical focal point 0–1 (legacy fallback). */
  focal_y?: number;
  /** Normalized crop rect for mobile hero (5:6). */
  crop_mobile?: HeroCrop;
  /** Normalized crop rect for desktop hero (21:9). */
  crop_desktop?: HeroCrop;
};

export type HeroData = {
  headline?: string;
  subheadline?: string;
  cta_label?: string;
  cta_url?: string;
  /** Legacy single image; still supported as fallback. */
  media_url?: string;
  /** Legacy URL list; still supported when `slides` is absent. */
  media_urls?: string[];
  /** Preferred slide list with optional focal points. */
  slides?: HeroSlide[];
  /** Slide dwell time in ms (default 5500). */
  media_interval_ms?: number;
};

function clampFocal(n: unknown, fallback = 0.5): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

/** Normalize hero media into slides with crop + focal metadata. */
export function heroSlides(hero: HeroData): HeroSlide[] {
  if (Array.isArray(hero.slides) && hero.slides.length) {
    return hero.slides
      .map((s) => ({
        url: (s?.url || '').trim(),
        focal_x: clampFocal(s?.focal_x),
        focal_y: clampFocal(s?.focal_y),
        crop_mobile: normalizeCrop(s?.crop_mobile ?? defaultHeroCrop()),
        crop_desktop: normalizeCrop(s?.crop_desktop ?? defaultHeroCrop()),
      }))
      .filter((s) => s.url);
  }
  const urls = heroMediaUrls(hero);
  const full = defaultHeroCrop();
  return urls.map((url) => ({
    url,
    focal_x: 0.5,
    focal_y: 0.5,
    crop_mobile: full,
    crop_desktop: full,
  }));
}

/** Resolve ordered hero slide URLs from CMS block data. */
export function heroMediaUrls(hero: HeroData): string[] {
  if (Array.isArray(hero.slides) && hero.slides.length) {
    return hero.slides.map((s) => (s?.url || '').trim()).filter(Boolean);
  }
  const multi = (hero.media_urls || []).map((u) => u.trim()).filter(Boolean);
  if (multi.length) return multi;
  if (hero.media_url?.trim()) return [hero.media_url.trim()];
  return [];
}

export type AnnouncementData = {
  messages?: string[];
  /** Seconds each message stays visible before rotating (default 4). */
  rotation_interval_seconds?: number;
};

export type IdlePromoData = {
  enabled?: boolean;
  idle_seconds?: number;
  image_url?: string;
  text?: string;
  button_label?: string;
  button_url?: string;
};

export type HighlightSlide = {
  id: string;
  image_url: string;
  caption: string;
  caption_position: 'top' | 'centre' | 'bottom' | string;
  sort_order: number;
  product_id?: string | null;
  product_slug?: string | null;
};

export type Highlight = {
  id: string;
  title: string;
  media_url: string;
  link_url?: string | null;
  position: number;
  slides?: HighlightSlide[];
};

export type ProductImage = {
  id: string;
  url: string;
  position: number;
  variant_id?: string | null;
};

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price?: number | null;
  is_bundle: boolean;
  variants?: ProductVariant[];
  primary_image?: ProductImage | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  position: number;
};

export type FeaturedReview = {
  id: string;
  product_id: string;
  customer_name: string;
  rating: number;
  body?: string | null;
  is_featured: boolean;
  created_at: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  cover_image?: string | null;
  published_at?: string | null;
  total_reads?: number;
  currently_reading?: number;
};

export type StatsCounter = {
  key: string;
  value: number;
  is_manual_override: boolean;
};

/** Content block `data` may arrive as object or JSON string depending on driver. */
export function parseBlockData<T>(data: unknown): T {
  if (typeof data === 'string') {
    return JSON.parse(data) as T;
  }
  return data as T;
}
