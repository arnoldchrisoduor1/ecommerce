-- Task 35: persisted admin password (seeded from ADMIN_DEFAULT_PASSWORD on first run).
CREATE TABLE admin_credentials (
    id             SMALLINT PRIMARY KEY CHECK (id = 1),
    email          TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    seeded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_verification_codes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    purpose      VARCHAR(32) NOT NULL DEFAULT 'password_change',
    expires_at   TIMESTAMPTZ NOT NULL,
    attempts     INT NOT NULL DEFAULT 0,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_verification_codes_email_purpose_idx
    ON admin_verification_codes (lower(email), purpose, created_at DESC);
