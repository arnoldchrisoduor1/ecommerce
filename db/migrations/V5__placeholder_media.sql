-- Replace MinIO CMS paths with local static SVG placeholders so the
-- homepage renders without needing objects in the bucket.

UPDATE highlights
SET media_url = '/media/highlight.svg'
WHERE media_url NOT LIKE '/%';

UPDATE content_blocks
SET data = jsonb_set(
  jsonb_set(
    data,
    '{media_url}',
    '"/media/hero.svg"',
    true
  ),
  '{media_urls}',
  '["/media/hero.svg"]',
  true
)
WHERE key = 'hero'
  AND data ? 'media_url'
  AND (data->>'media_url') NOT LIKE '/%';

UPDATE blog_posts
SET cover_image = NULL
WHERE cover_image IS NOT NULL
  AND cover_image NOT LIKE '/%'
  AND cover_image NOT LIKE 'http%';
