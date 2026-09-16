-- Multi-image highlight stories. Keep highlights.media_url until verified (Task 6).
CREATE TABLE highlight_slides (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    highlight_id     UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    image_url        TEXT NOT NULL,
    caption          TEXT NOT NULL DEFAULT '',
    caption_position VARCHAR(16) NOT NULL DEFAULT 'bottom'
        CHECK (caption_position IN ('top', 'centre', 'bottom')),
    sort_order       INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_highlight_slides_highlight_order
    ON highlight_slides (highlight_id, sort_order);

-- Migrate existing single images as slide 1.
INSERT INTO highlight_slides (highlight_id, image_url, caption, caption_position, sort_order)
SELECT h.id, h.media_url, '', 'bottom', 0
FROM highlights h
WHERE h.media_url IS NOT NULL
  AND btrim(h.media_url) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM highlight_slides s WHERE s.highlight_id = h.id
  );
