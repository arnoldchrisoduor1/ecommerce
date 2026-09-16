-- Blog read analytics (Task 14): one read per session per post

CREATE TABLE blog_reads (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    session_id       VARCHAR(128) NOT NULL,
    first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_seconds INT NOT NULL DEFAULT 0,
    max_scroll_pct   INT NOT NULL DEFAULT 0 CHECK (max_scroll_pct >= 0 AND max_scroll_pct <= 100),
    UNIQUE (post_id, session_id)
);

CREATE INDEX blog_reads_post_id_idx ON blog_reads (post_id);
CREATE INDEX blog_reads_last_seen_idx ON blog_reads (last_seen);
CREATE INDEX blog_reads_first_seen_idx ON blog_reads (first_seen);
