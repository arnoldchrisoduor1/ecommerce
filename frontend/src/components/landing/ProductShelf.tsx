import Link from 'next/link';
import { ProductCard } from '@/components/product/ProductCard';
import type { ProductListItem } from '@/lib/api';

type Props = {
  title: string;
  products: ProductListItem[];
  seeAllHref?: string;
};

export function ProductShelf({ title, products, seeAllHref = '/shop' }: Props) {
  if (products.length === 0) return null;

  return (
    <section className="shelf" aria-labelledby="new-arrivals-heading">
      <div className="shelf__header">
        <h2 id="new-arrivals-heading" className="ds-display ds-display--md">
          {title}
        </h2>
        <Link href={seeAllHref} className="ds-label shelf__link">
          View all
        </Link>
      </div>
      <div className="shelf__grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
