import {
  apiGet,
  parseBlockData,
  type AnnouncementData,
  type BlogPost,
  type Category,
  type ContentBlock,
  type FeaturedReview,
  type HeroData,
  type Highlight,
  type ProductListItem,
  type StatsCounter,
} from '@/lib/api';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { MainNav } from '@/components/layout/MainNav';
import { StylistChat } from '@/components/layout/StylistChat';
import { CartProvider } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { BlogPreview } from '@/components/landing/BlogPreview';
import { EmailCapture } from '@/components/landing/EmailCapture';
import { FeaturedReviews } from '@/components/landing/FeaturedReviews';
import { Hero } from '@/components/landing/Hero';
import { HighlightsReel } from '@/components/landing/HighlightsReel';
import { ProductShelf } from '@/components/landing/ProductShelf';
import './landing.css';
import './catalog.css';

export const dynamic = 'force-dynamic';

async function loadLanding() {
  const settled = await Promise.allSettled([
    apiGet<ContentBlock<unknown>>('/content/blocks/announcement_bar'),
    apiGet<ContentBlock<unknown>>('/content/blocks/hero'),
    apiGet<{ highlights: Highlight[] }>('/content/highlights'),
    apiGet<{ categories: Category[] }>('/catalog/categories'),
    apiGet<{ products: ProductListItem[] }>('/catalog/products?sort=latest&page_size=8'),
    apiGet<{ reviews: FeaturedReview[] }>('/reviews/featured'),
    apiGet<{ posts: BlogPost[] }>('/content/blog'),
    apiGet<{ counters: StatsCounter[] }>('/content/stats'),
  ]);

  const value = <T,>(i: number, fallback: T): T => {
    const r = settled[i];
    return r.status === 'fulfilled' ? (r.value as T) : fallback;
  };

  const announceBlock = value<ContentBlock<unknown> | null>(0, null);
  const heroBlock = value<ContentBlock<unknown> | null>(1, null);
  const highlights = value<{ highlights: Highlight[] }>(2, { highlights: [] }).highlights;
  const categories = value<{ categories: Category[] }>(3, { categories: [] }).categories;
  const products = value<{ products: ProductListItem[] }>(4, { products: [] }).products;
  const reviews = value<{ reviews: FeaturedReview[] }>(5, { reviews: [] }).reviews;
  const posts = value<{ posts: BlogPost[] }>(6, { posts: [] }).posts;
  const counters = value<{ counters: StatsCounter[] }>(7, { counters: [] }).counters;

  const announce = announceBlock
    ? parseBlockData<AnnouncementData>(announceBlock.data)
    : { messages: [] as string[] };
  const hero = heroBlock ? parseBlockData<HeroData>(heroBlock.data) : {};

  const joined =
    counters.find((c) => c.key === 'items_sold_total' || c.key === 'email_subscribers')
      ?.value ?? counters[0]?.value;

  return {
    messages: announce.messages ?? [],
    hero,
    highlights,
    categories,
    products,
    reviews,
    posts,
    joined,
    itemsSold: counters.find((c) => c.key === 'items_sold_total')?.value,
  };
}

export default async function HomePage() {
  const data = await loadLanding();

  return (
    <CartProvider>
      <div className="landing-page">
        <AnnouncementBar messages={data.messages} />
        <MainNav categories={data.categories} />
        <HighlightsReel highlights={data.highlights} />
        <Hero hero={data.hero} />
        <ProductShelf title="New arrivals" products={data.products} />
        <FeaturedReviews reviews={data.reviews} />
        <BlogPreview posts={data.posts} />
        {data.itemsSold != null ? (
          <section className="stats-strip" aria-label="Store stats">
            <p className="ds-display ds-display--lg stats-strip__value">
              {data.itemsSold.toLocaleString('en-KE')}
            </p>
            <p className="ds-label stats-strip__label">Items sold</p>
          </section>
        ) : null}
        <EmailCapture joinedCount={data.joined} />
        <StylistChat />
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
