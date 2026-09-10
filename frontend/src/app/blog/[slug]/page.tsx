import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { apiGet, type BlogPost } from '@/lib/api';
import { StoreChrome } from '@/components/layout/StoreChrome';
import '../../landing.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

type BlogPostDetail = BlogPost & { body: string };

export default async function BlogPostPage({ params }: Props) {
  noStore();
  const { slug } = await params;
  let post: BlogPostDetail | null = null;
  try {
    post = await apiGet<BlogPostDetail>(`/content/blog/${slug}`);
  } catch {
    post = null;
  }
  if (!post) notFound();

  const paragraphs = post.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <StoreChrome>
      <article className="blog-article">
        <p className="ds-label">
          <Link href="/blog">Style guide</Link>
        </p>
        <h1 className="ds-display ds-display--lg">{post.title}</h1>
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt=""
            className="blog-article__cover"
            loading="eager"
            decoding="async"
          />
        ) : null}
        <div className="blog-article__body">
          {paragraphs.map((para) => (
            <p key={para.slice(0, 48)} className="ds-body">
              {para}
            </p>
          ))}
        </div>
      </article>
    </StoreChrome>
  );
}
