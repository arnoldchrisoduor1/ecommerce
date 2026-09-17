package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
)

const blogPresenceTTL = 5 * time.Minute

type blogReadStartRequest struct {
	SessionID string `json:"session_id"`
}

type blogReadHeartbeatRequest struct {
	SessionID string `json:"session_id"`
	Seconds   *int   `json:"seconds,omitempty"`
}

type blogReadScrollRequest struct {
	SessionID string `json:"session_id"`
	Percent   int    `json:"percent"`
}

func blogPresenceKey(postID string) string {
	return "presence:blog:" + postID
}

func (h *Handler) touchBlogPresence(c *fiber.Ctx, postID, sessionID string) error {
	score := float64(time.Now().UnixMilli())
	return h.rdb.ZAdd(c.Context(), blogPresenceKey(postID), redis.Z{Score: score, Member: sessionID}).Err()
}

func (h *Handler) blogPresenceCount(c *fiber.Ctx, postID string) (int64, error) {
	key := blogPresenceKey(postID)
	cutoff := float64(time.Now().Add(-blogPresenceTTL).UnixMilli())
	if err := h.rdb.ZRemRangeByScore(c.Context(), key, "-inf", strconv.FormatFloat(cutoff, 'f', 0, 64)).Err(); err != nil {
		return 0, err
	}
	return h.rdb.ZCard(c.Context(), key).Result()
}

func (h *Handler) ensureBlogPost(c *fiber.Ctx, postID string) error {
	var exists bool
	err := h.db.QueryRow(c.Context(), `
		SELECT EXISTS(SELECT 1 FROM blog_posts WHERE id = $1 AND status = 'published')`, postID,
	).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return fiber.ErrNotFound
	}
	return nil
}

// BlogReadStart upserts one read row per session/post and refreshes presence.
func (h *Handler) BlogReadStart(c *fiber.Ctx) error {
	postID := c.Params("id")
	if _, err := uuid.Parse(postID); err != nil {
		return badRequest(c, "invalid post id")
	}
	var req blogReadStartRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" || len(sessionID) > 128 {
		return badRequest(c, "session_id is required")
	}
	if err := h.ensureBlogPost(c, postID); err != nil {
		if err == fiber.ErrNotFound {
			return notFound(c, "blog post not found")
		}
		return internalError(c, "BlogReadStart ensure", err)
	}

	var id string
	created := true
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO blog_reads (post_id, session_id)
		VALUES ($1, $2)
		ON CONFLICT (post_id, session_id) DO NOTHING
		RETURNING id`, postID, sessionID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		created = false
		err = h.db.QueryRow(c.Context(), `
			UPDATE blog_reads SET last_seen = now()
			WHERE post_id = $1 AND session_id = $2
			RETURNING id`, postID, sessionID,
		).Scan(&id)
		if err != nil {
			return internalError(c, "BlogReadStart upsert", err)
		}
	} else if err != nil {
		return internalError(c, "BlogReadStart insert", err)
	}
	_ = h.upsertAnalyticsSession(c.Context(), sessionID, hashIP(c.IP()), nil)
	if h.rdb != nil {
		_ = h.touchBlogPresence(c, postID, sessionID)
	}
	count, _ := h.blogPostTotalReads(c, postID)
	reading, _ := h.blogPresenceCount(c, postID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":              id,
		"created":         created,
		"total_reads":     count,
		"currently_reading": reading,
	})
}

// BlogReadHeartbeat bumps duration + presence (15s ticks).
func (h *Handler) BlogReadHeartbeat(c *fiber.Ctx) error {
	postID := c.Params("id")
	var req blogReadHeartbeatRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		return badRequest(c, "session_id is required")
	}
	seconds := 15
	if req.Seconds != nil && *req.Seconds > 0 && *req.Seconds <= 120 {
		seconds = *req.Seconds
	}
	tag, err := h.db.Exec(c.Context(), `
		UPDATE blog_reads
		SET duration_seconds = duration_seconds + $1, last_seen = now()
		WHERE post_id = $2 AND session_id = $3`, seconds, postID, sessionID)
	if err != nil {
		return internalError(c, "BlogReadHeartbeat", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "read not found")
	}
	if h.rdb != nil {
		_ = h.touchBlogPresence(c, postID, sessionID)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// BlogReadScroll records max scroll depth milestones (25/50/75/100).
func (h *Handler) BlogReadScroll(c *fiber.Ctx) error {
	postID := c.Params("id")
	var req blogReadScrollRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	pct := req.Percent
	switch pct {
	case 25, 50, 75, 100:
	default:
		return badRequest(c, "percent must be 25, 50, 75, or 100")
	}
	if sessionID == "" {
		return badRequest(c, "session_id is required")
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE blog_reads
		SET max_scroll_pct = GREATEST(max_scroll_pct, $1), last_seen = now()
		WHERE post_id = $2 AND session_id = $3`, pct, postID, sessionID)
	if err != nil {
		return internalError(c, "BlogReadScroll", err)
	}
	if h.rdb != nil {
		_ = h.touchBlogPresence(c, postID, sessionID)
	}
	return c.JSON(fiber.Map{"ok": true})
}

type blogPresenceBatchRequest struct {
	PostIDs []string `json:"post_ids"`
}

// BlogPresenceBatchCount returns live reading counts for many posts in one call.
func (h *Handler) BlogPresenceBatchCount(c *fiber.Ctx) error {
	var req blogPresenceBatchRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if len(req.PostIDs) == 0 {
		return c.JSON(fiber.Map{"counts": fiber.Map{}})
	}
	if len(req.PostIDs) > 50 {
		return badRequest(c, "too many post ids (max 50)")
	}

	counts := make(map[string]int64, len(req.PostIDs))
	if h.rdb == nil {
		rows, err := h.db.Query(c.Context(), `
			SELECT post_id::text, COUNT(*)::bigint
			FROM blog_reads
			WHERE post_id = ANY($1::uuid[])
			  AND last_seen >= now() - interval '5 minutes'
			GROUP BY post_id`, req.PostIDs)
		if err != nil {
			return internalError(c, "BlogPresenceBatchCount db", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			var n int64
			if err := rows.Scan(&id, &n); err != nil {
				return internalError(c, "BlogPresenceBatchCount scan", err)
			}
			counts[id] = n
		}
		return c.JSON(fiber.Map{"counts": counts})
	}

	cutoff := strconv.FormatFloat(float64(time.Now().Add(-blogPresenceTTL).UnixMilli()), 'f', 0, 64)
	ctx := c.Context()
	pipe := h.rdb.Pipeline()
	type cmdPair struct {
		id    string
		zcard *redis.IntCmd
	}
	pairs := make([]cmdPair, 0, len(req.PostIDs))
	for _, id := range req.PostIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		key := blogPresenceKey(id)
		pipe.ZRemRangeByScore(ctx, key, "-inf", cutoff)
		zcard := pipe.ZCard(ctx, key)
		pairs = append(pairs, cmdPair{id: id, zcard: zcard})
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return internalError(c, "BlogPresenceBatchCount pipeline", err)
	}
	for _, p := range pairs {
		n, err := p.zcard.Result()
		if err != nil {
			return internalError(c, "BlogPresenceBatchCount zcard", err)
		}
		counts[p.id] = n
	}
	return c.JSON(fiber.Map{"counts": counts})
}

// BlogPresenceCount returns readers active in last 5 minutes.
func (h *Handler) BlogPresenceCount(c *fiber.Ctx) error {
	postID := c.Params("id")
	if h.rdb == nil {
		var count int64
		err := h.db.QueryRow(c.Context(), `
			SELECT COUNT(*)::bigint FROM blog_reads
			WHERE post_id = $1 AND last_seen >= now() - interval '5 minutes'`, postID,
		).Scan(&count)
		if err != nil {
			return internalError(c, "BlogPresenceCount db", err)
		}
		return c.JSON(fiber.Map{"post_id": postID, "count": count})
	}
	count, err := h.blogPresenceCount(c, postID)
	if err != nil {
		return internalError(c, "BlogPresenceCount", err)
	}
	return c.JSON(fiber.Map{"post_id": postID, "count": count})
}

func (h *Handler) blogPostTotalReads(c *fiber.Ctx, postID string) (int64, error) {
	var n int64
	err := h.db.QueryRow(c.Context(), `
		SELECT COUNT(*)::bigint FROM blog_reads WHERE post_id = $1`, postID).Scan(&n)
	return n, err
}

type adminBlogAnalyticsRow struct {
	PostID            string  `json:"post_id"`
	Title             string  `json:"title"`
	Slug              string  `json:"slug"`
	TotalReads        int64   `json:"total_reads"`
	UniqueReaders     int64   `json:"unique_readers"`
	CurrentlyReading  int64   `json:"currently_reading"`
	AvgSeconds        float64 `json:"avg_seconds"`
	CompletionRate    float64 `json:"completion_rate"`
}

// AdminBlogAnalytics lists per-post read stats for a date range.
func (h *Handler) AdminBlogAnalytics(c *fiber.Ctx) error {
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	sort := c.Query("sort", "reads")
	orderBy := "total_reads DESC, p.title"
	switch sort {
	case "reads":
		orderBy = "total_reads DESC, p.title"
	case "unique":
		orderBy = "unique_readers DESC, p.title"
	case "reading":
		orderBy = "currently_reading DESC, p.title"
	case "avg_time":
		orderBy = "avg_seconds DESC, p.title"
	case "completion":
		orderBy = "completion_rate DESC, p.title"
	case "title":
		orderBy = "p.title ASC"
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT
			p.id, p.title, p.slug,
			COUNT(br.id)::bigint AS total_reads,
			COUNT(DISTINCT br.session_id)::bigint AS unique_readers,
			COUNT(*) FILTER (WHERE br.last_seen >= now() - interval '5 minutes')::bigint AS currently_reading,
			COALESCE(AVG(br.duration_seconds), 0)::float8 AS avg_seconds,
			COALESCE(AVG(br.max_scroll_pct), 0)::float8 AS completion_rate
		FROM blog_posts p
		LEFT JOIN blog_reads br ON br.post_id = p.id
			AND br.first_seen >= $1 AND br.first_seen <= $2
		WHERE p.status = 'published'
		GROUP BY p.id, p.title, p.slug
		ORDER BY `+orderBy, from, to)
	if err != nil {
		return internalError(c, "AdminBlogAnalytics query", err)
	}
	defer rows.Close()

	out := make([]adminBlogAnalyticsRow, 0)
	for rows.Next() {
		var r adminBlogAnalyticsRow
		if err := rows.Scan(&r.PostID, &r.Title, &r.Slug, &r.TotalReads, &r.UniqueReaders,
			&r.CurrentlyReading, &r.AvgSeconds, &r.CompletionRate); err != nil {
			return internalError(c, "AdminBlogAnalytics scan", err)
		}
		out = append(out, r)
	}
	return c.JSON(fiber.Map{
		"posts": out,
		"from":  from.Format("2006-01-02"),
		"to":    to.Format("2006-01-02"),
	})
}
