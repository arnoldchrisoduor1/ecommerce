ALTER TABLE highlight_slides
    ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX idx_highlight_slides_product_id ON highlight_slides (product_id);
