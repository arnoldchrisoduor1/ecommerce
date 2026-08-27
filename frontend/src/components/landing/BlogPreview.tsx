import Link from 'next/link';
import type { BlogPost } from '@/lib/api';

type Props = {
  posts: BlogPost[];
};

export function BlogPreview({ posts }: Props) {
  if (posts.length === 0) return null;

  return (
    <section className="blog-preview" aria-labelledby="blog-heading">
      <div className="shelf__header">
        <h2 id="blog-heading" className="ds-display ds-display--md">
          Style guide
        </h2>
        <Link href="/blog" className="ds-label shelf__link">
          Read more
        </Link>
      </div>
      <ul className="blog-preview__list">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/blog/${p.slug}`} className="blog-preview__card">
              {p.cover_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.cover_image}
                  alt=""
                  className="blog-preview__cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="blog-preview__cover blog-preview__cover--empty" aria-hidden="true" />
              )}
              <span className="ds-display ds-display--sm">{p.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
