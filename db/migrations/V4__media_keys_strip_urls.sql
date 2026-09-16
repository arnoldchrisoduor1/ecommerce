-- Store bare object keys (or site-relative paths) instead of absolute MinIO URLs.
-- Strips http(s)://host[:port]/{media|ecommerce|bucket}/... → key path.

CREATE OR REPLACE FUNCTION ecomm_strip_media_url(v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  path text;
  rest text;
  first text;
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN v;
  END IF;
  -- Keep site-relative paths (/media/product.svg, etc.)
  IF left(btrim(v), 1) = '/' THEN
    RETURN btrim(v);
  END IF;
  IF position('://' in v) = 0 THEN
    RETURN ltrim(btrim(v), '/');
  END IF;

  path := regexp_replace(v, '^https?://[^/]+/', '');
  path := ltrim(path, '/');
  first := split_part(path, '/', 1);
  IF lower(first) IN ('media', 'ecommerce') AND position('/' in path) > 0 THEN
    rest := substr(path, length(first) + 2);
    RETURN rest;
  END IF;
  RETURN path;
END;
$$;

UPDATE product_images
SET url = ecomm_strip_media_url(url)
WHERE url ~ '^https?://';

UPDATE highlights
SET media_url = ecomm_strip_media_url(media_url)
WHERE media_url ~ '^https?://';

UPDATE blog_posts
SET cover_image = ecomm_strip_media_url(cover_image)
WHERE cover_image IS NOT NULL AND cover_image ~ '^https?://';

-- content_blocks JSON: media_url + media_urls[]
UPDATE content_blocks
SET data = jsonb_set(
  data,
  '{media_url}',
  to_jsonb(ecomm_strip_media_url(data->>'media_url')),
  true
)
WHERE data ? 'media_url'
  AND (data->>'media_url') ~ '^https?://';

UPDATE content_blocks cb
SET data = jsonb_set(
  cb.data,
  '{media_urls}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(ecomm_strip_media_url(elem))), '[]'::jsonb)
    FROM jsonb_array_elements_text(cb.data->'media_urls') AS elem
  ),
  true
)
WHERE cb.data ? 'media_urls'
  AND jsonb_typeof(cb.data->'media_urls') = 'array';

DROP FUNCTION IF EXISTS ecomm_strip_media_url(text);
