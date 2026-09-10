-- Delivery estimate window stamped onto each order at checkout.
-- Defaults (3–8 business days) come from content_blocks key delivery_estimate;
-- admin can override per order after the fact.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS estimated_delivery_min_days INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS estimated_delivery_max_days INT NOT NULL DEFAULT 8;

ALTER TABLE orders
    ADD CONSTRAINT orders_estimated_delivery_range
    CHECK (estimated_delivery_min_days >= 1 AND estimated_delivery_max_days >= estimated_delivery_min_days);
