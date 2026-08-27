-- V1__init.sql
-- Core ecommerce schema: catalog, bundles, cart/orders, payments, discounts,
-- reviews, and the CMS content-block layer.
-- Target: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- CUSTOMERS & ADDRESSES
-- ============================================================

CREATE TABLE customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE,
    phone         VARCHAR(32) UNIQUE,
    full_name     VARCHAR(255),
    password_hash TEXT,                 -- null for guest-only customers
    is_guest      BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
    label         VARCHAR(64),          -- 'home', 'work', etc.
    line1         VARCHAR(255) NOT NULL,
    line2         VARCHAR(255),
    city          VARCHAR(120) NOT NULL,
    county        VARCHAR(120),
    phone         VARCHAR(32) NOT NULL,
    is_default    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CATALOG: categories, products, variants, images, bundles
-- ============================================================

CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) NOT NULL UNIQUE,
    parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    position    INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(280) NOT NULL UNIQUE,
    description   TEXT,
    category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    material      VARCHAR(120),          -- e.g. "Cotton", "Leather"
    base_price    NUMERIC(12,2) NOT NULL,
    sale_price    NUMERIC(12,2),         -- null = not on sale
    is_bundle     BOOLEAN NOT NULL DEFAULT false,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|active|archived
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku             VARCHAR(64) NOT NULL UNIQUE,
    size            VARCHAR(20),
    color           VARCHAR(40),
    stock_qty       INT NOT NULL DEFAULT 0,
    price_override  NUMERIC(12,2),       -- null = use product base/sale price
    low_stock_threshold INT NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE product_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id  UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    position    INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_images_product ON product_images(product_id);

-- Bundles are products with is_bundle = true; bundle_items maps them to
-- the component products/variants included, with a quantity each.
CREATE TABLE bundle_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity            INT NOT NULL DEFAULT 1
);
CREATE INDEX idx_bundle_items_bundle ON bundle_items(bundle_product_id);

-- ============================================================
-- CART
-- ============================================================

CREATE TABLE carts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    session_id  VARCHAR(64),           -- for guest carts, cookie-based
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_carts_session ON carts(session_id);

CREATE TABLE cart_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id  UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity    INT NOT NULL DEFAULT 1,
    UNIQUE (cart_id, variant_id)
);

-- ============================================================
-- ORDERS & PAYMENTS
-- ============================================================

CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
    status            VARCHAR(24) NOT NULL DEFAULT 'pending',
                      -- pending|paid|fulfilled|cancelled|refunded
    subtotal          NUMERIC(12,2) NOT NULL,
    delivery_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total             NUMERIC(12,2) NOT NULL,
    payment_method    VARCHAR(24),      -- mpesa|card
    payment_status    VARCHAR(24) NOT NULL DEFAULT 'unpaid',
    shipping_address  JSONB NOT NULL,   -- snapshot at time of order
    discount_code     VARCHAR(40),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id  UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity    INT NOT NULL,
    unit_price  NUMERIC(12,2) NOT NULL   -- price at time of purchase
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider      VARCHAR(24) NOT NULL,   -- mpesa|flutterwave|pesapay
    provider_ref  VARCHAR(120),           -- e.g. M-Pesa CheckoutRequestID
    amount        NUMERIC(12,2) NOT NULL,
    status        VARCHAR(24) NOT NULL DEFAULT 'initiated',
    raw_payload   JSONB,                  -- full callback payload for audit
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON payments(order_id);

-- ============================================================
-- DISCOUNTS (exit-intent modal + general promo codes)
-- ============================================================

CREATE TABLE discounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         VARCHAR(40) NOT NULL UNIQUE,
    type         VARCHAR(16) NOT NULL,     -- percentage|fixed
    value        NUMERIC(12,2) NOT NULL,
    max_claims   INT,                       -- null = unlimited
    active_from  TIMESTAMPTZ,
    active_to    TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    context      VARCHAR(24) NOT NULL DEFAULT 'general' -- exit_intent|general
);

CREATE TABLE discount_claims (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id  UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
    session_id   VARCHAR(64),
    order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
    claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_claims_discount ON discount_claims(discount_id);
-- Used to render "N people claimed this today" — count rows where
-- claimed_at >= current_date for a given discount_id.

-- ============================================================
-- REVIEWS
-- ============================================================

CREATE TABLE reviews (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_name VARCHAR(120) NOT NULL,
    rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body          TEXT,
    is_featured   BOOLEAN NOT NULL DEFAULT false,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending|approved|rejected
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_featured ON reviews(is_featured) WHERE is_featured = true;

-- ============================================================
-- WISHLIST
-- ============================================================

CREATE TABLE wishlist_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, product_id)
);

-- ============================================================
-- CMS / CONTENT-BLOCK LAYER
-- Admin-editable storefront content: hero, announcement bar,
-- highlights reel, curated shelves, footer, stats counters.
-- ============================================================

CREATE TABLE content_blocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(64) NOT NULL UNIQUE, -- 'hero', 'announcement_bar', 'footer'
    data        JSONB NOT NULL,               -- flexible shape per block type
    is_active   BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE highlights (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(60) NOT NULL,
    media_url   TEXT NOT NULL,
    link_url    TEXT,
    position    INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE curated_shelves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(64) NOT NULL UNIQUE, -- 'new_arrivals', 'customer_favourites'
    title       VARCHAR(120) NOT NULL,
    position    INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE curated_shelf_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shelf_id    UUID NOT NULL REFERENCES curated_shelves(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    UNIQUE (shelf_id, product_id)
);

CREATE TABLE blog_posts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    slug          VARCHAR(280) NOT NULL UNIQUE,
    body          TEXT NOT NULL,
    cover_image   TEXT,
    status        VARCHAR(16) NOT NULL DEFAULT 'draft', -- draft|published
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stats_counters (
    key           VARCHAR(64) PRIMARY KEY, -- 'items_sold_total'
    value         BIGINT NOT NULL DEFAULT 0,
    is_manual_override BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- NOTE on live viewer counts / presence:
-- These are high-frequency, ephemeral, and do not belong in Postgres.
-- Track them in Redis instead, e.g.:
--   key:   presence:product:<product_id>
--   value: sorted set of session_ids with score = last-seen timestamp
--   read:  ZREMRANGEBYSCORE to expire stale entries, then ZCARD for count
-- ============================================================
