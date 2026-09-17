-- AI usage tracking and per-user access control (Task 38)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ai_access_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS ai_settings (
    id                        INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    features_globally_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ai_settings (id, features_globally_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id        VARCHAR(64),
    feature           VARCHAR(32) NOT NULL,
    model             VARCHAR(128) NOT NULL,
    prompt_tokens     INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    estimated_cost    NUMERIC(12, 6) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_user_id_idx ON ai_usage_log (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_session_id_idx ON ai_usage_log (session_id)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_log_feature_idx ON ai_usage_log (feature);
