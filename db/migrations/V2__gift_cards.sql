-- Gift cards (feature list §8) — purchase + redemption balances.

CREATE TABLE gift_cards (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code             VARCHAR(40) NOT NULL UNIQUE,
    initial_balance  NUMERIC(12,2) NOT NULL CHECK (initial_balance > 0),
    balance          NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
    purchaser_email  VARCHAR(255),
    purchaser_phone  VARCHAR(32),
    status           VARCHAR(24) NOT NULL DEFAULT 'active',
                     -- active|depleted|cancelled
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gift_card_redemptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gift_card_id  UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
    order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    session_id    VARCHAR(64),
    redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gift_redemptions_card ON gift_card_redemptions(gift_card_id);
