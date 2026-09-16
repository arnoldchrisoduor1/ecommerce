-- Analytics foundation (Tasks 10, 11, 14).
CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    user_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash     VARCHAR(64)
);

CREATE INDEX idx_sessions_last_seen ON sessions (last_seen DESC);
CREATE INDEX idx_sessions_user_id ON sessions (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE page_views (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES customers(id) ON DELETE SET NULL,
    path             TEXT NOT NULL,
    entity_type      VARCHAR(16) NOT NULL
        CHECK (entity_type IN ('product', 'blog', 'page')),
    entity_id        UUID,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at         TIMESTAMPTZ,
    duration_seconds INT NOT NULL DEFAULT 0,
    referrer         TEXT,
    user_agent       TEXT,
    ip_hash          VARCHAR(64)
);

CREATE INDEX idx_page_views_entity_started
    ON page_views (entity_type, entity_id, started_at DESC);

CREATE INDEX idx_page_views_user_started
    ON page_views (user_id, started_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX idx_page_views_session_started
    ON page_views (session_id, started_at DESC);

CREATE INDEX idx_page_views_path_started
    ON page_views (path, started_at DESC);
