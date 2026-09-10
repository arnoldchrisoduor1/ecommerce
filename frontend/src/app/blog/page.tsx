import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { apiGet, type BlogPost } from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import '../landing.css';

export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  noStore();
  let posts: BlogPost[] = [];
  try {
    const res = await apiGet<{ posts: BlogPost[] }>('/content/blog');
    posts = res.posts;
  } catch {
    posts = [];
  }

  return (
    <StoreChrome>
      <main className="blog-page">
        <header className="blog-page__header">
          <p className="ds-label">Editorial</p>
          <h1 className="ds-display ds-display--lg">Style guide</h1>
          <p className="ds-body">
            Fit notes, layering ideas, and wardrobe building — edited from the admin CMS.
          </p>
        </header>
        {posts.length === 0 ? (
          <p className="ds-body">No published guides yet.</p>
        ) : (
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
        )}
      </main>
    </StoreChrome>
  );
}
