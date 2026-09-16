-- Real social-proof activity feed (Task 8; Task 15 reads this too).
CREATE TABLE activity_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type           VARCHAR(32) NOT NULL
        CHECK (type IN ('purchase', 'wishlist_add', 'cart_add', 'newsletter_signup')),
    user_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
    product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
    order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
    price_at_event NUMERIC(12, 2),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_events_created
    ON activity_events (created_at DESC);

CREATE INDEX idx_activity_events_type_created
    ON activity_events (type, created_at DESC);
