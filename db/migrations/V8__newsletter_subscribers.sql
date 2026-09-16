-- Newsletter subscribers (public signup; admin list in Task 16).
CREATE TABLE newsletter_subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    source          VARCHAR(40) NOT NULL DEFAULT 'footer', -- footer|modal|checkout
    status          VARCHAR(24) NOT NULL DEFAULT 'subscribed', -- subscribed|unsubscribed
    unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_newsletter_subscribers_email_lower
    ON newsletter_subscribers (lower(email));

CREATE INDEX idx_newsletter_subscribers_status_created
    ON newsletter_subscribers (status, created_at DESC);

CREATE INDEX idx_newsletter_subscribers_token
    ON newsletter_subscribers (unsubscribe_token);
