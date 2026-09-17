-- Task 37: track when admin last opened the activity feed.
CREATE TABLE admin_activity_state (
    id             SMALLINT PRIMARY KEY CHECK (id = 1),
    last_read_at   TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin_activity_state (id) VALUES (1) ON CONFLICT DO NOTHING;
