-- Task 15: admin activity feed pagination by customer.
CREATE INDEX IF NOT EXISTS idx_activity_events_user_created
    ON activity_events (user_id, created_at DESC);
