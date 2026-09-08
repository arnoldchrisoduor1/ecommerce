import type { FeaturedReview } from '@/lib/api';

type Props = {
  reviews: FeaturedReview[];
};

export function FeaturedReviews({ reviews }: Props) {
  if (reviews.length === 0) return null;

  return (
    <section className="reviews-feat" aria-labelledby="reviews-heading" data-testid="featured-review">
      <h2 id="reviews-heading" className="ds-display ds-display--md">
        From customers
      </h2>
      <ul className="reviews-feat__list">
        {reviews.map((r) => (
          <li key={r.id} className="reviews-feat__item">
            <p className="ds-label reviews-feat__rating" aria-label={`${r.rating} of 5`}>
              {'★'.repeat(r.rating)}
              <span className="reviews-feat__rating-empty">
                {'★'.repeat(Math.max(0, 5 - r.rating))}
              </span>
            </p>
            <p className="ds-body reviews-feat__body">{r.body ?? ''}</p>
            <p className="ds-caption">{r.customer_name}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
