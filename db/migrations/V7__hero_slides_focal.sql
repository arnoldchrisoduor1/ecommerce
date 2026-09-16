-- Promote hero media_urls into slides with default focal points.
-- Idempotent: only fills slides when missing/empty and media_urls present.
UPDATE content_blocks
SET data = jsonb_set(
  data,
  '{slides}',
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'url', elem,
          'focal_x', 0.5,
          'focal_y', 0.5
        )
        ORDER BY ord
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements_text(COALESCE(data->'media_urls', '[]'::jsonb))
      WITH ORDINALITY AS t(elem, ord)
  ),
  true
)
WHERE key = 'hero'
  AND (
    data->'slides' IS NULL
    OR data->'slides' = 'null'::jsonb
    OR jsonb_typeof(data->'slides') <> 'array'
    OR jsonb_array_length(COALESCE(data->'slides', '[]'::jsonb)) = 0
  )
  AND jsonb_typeof(data->'media_urls') = 'array'
  AND jsonb_array_length(data->'media_urls') > 0;
