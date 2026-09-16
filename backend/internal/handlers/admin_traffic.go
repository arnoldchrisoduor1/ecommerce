package handlers

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

const adminTrafficCacheKey = "admin:traffic:presence:v1"
const adminTrafficCacheTTL = 60 * time.Second

type visitedPageRow struct {
	Rank          int     `json:"rank"`
	Path          string  `json:"path"`
	TotalViews    int64   `json:"total_views"`
	UniqueVisitors int64  `json:"unique_visitors"`
	AvgSeconds    float64 `json:"avg_seconds"`
}

type activeWindowStat struct {
	Count     int64   `json:"count"`
	Sparkline []int64 `json:"sparkline"`
}

type trafficPresenceResponse struct {
	CurrentlyOnline int64                       `json:"currently_online"`
	Windows         map[string]activeWindowStat `json:"windows"`
	Cached          bool                        `json:"cached,omitempty"`
}

// AdminMostVisitedPages lists paths by page_views in a date range.
func (h *Handler) AdminMostVisitedPages(c *fiber.Ctx) error {
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	limit := 25
	if v := c.Query("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT
			path,
			COUNT(*)::bigint AS total_views,
			COUNT(DISTINCT session_id)::bigint AS unique_visitors,
			COALESCE(AVG(duration_seconds), 0)::float8 AS avg_seconds
		FROM page_views
		WHERE started_at >= $1 AND started_at <= $2
		GROUP BY path
		ORDER BY total_views DESC, path
		LIMIT $3`, from, to, limit)
	if err != nil {
		return internalError(c, "AdminMostVisitedPages query", err)
	}
	defer rows.Close()

	pages := make([]visitedPageRow, 0)
	rank := 0
	for rows.Next() {
		rank++
		var row visitedPageRow
		if err := rows.Scan(&row.Path, &row.TotalViews, &row.UniqueVisitors, &row.AvgSeconds); err != nil {
			return internalError(c, "AdminMostVisitedPages scan", err)
		}
		row.Rank = rank
		pages = append(pages, row)
	}
	return c.JSON(fiber.Map{
		"pages": pages,
		"from":  from.Format("2006-01-02"),
		"to":    to.Format("2006-01-02"),
	})
}

// AdminTrafficPresence returns currently-online + active-user windows with sparklines.
// Window aggregates cached in Redis for 60s; currently_online always fresh for 30s polls.
func (h *Handler) AdminTrafficPresence(c *fiber.Ctx) error {
	var online int64
	if err := h.db.QueryRow(c.Context(), `
		SELECT COUNT(*)::bigint FROM sessions
		WHERE last_seen >= now() - interval '5 minutes'`).Scan(&online); err != nil {
		return internalError(c, "AdminTrafficPresence online", err)
	}

	var windows map[string]activeWindowStat
	cached := false
	if h.rdb != nil {
		if raw, err := h.rdb.Get(c.Context(), adminTrafficCacheKey).Bytes(); err == nil && len(raw) > 0 {
			if json.Unmarshal(raw, &windows) == nil && len(windows) > 0 {
				cached = true
			}
		}
	}
	if windows == nil {
		var err error
		windows, err = h.computeActiveWindows(c.Context())
		if err != nil {
			return internalError(c, "AdminTrafficPresence windows", err)
		}
		if h.rdb != nil {
			if b, e := json.Marshal(windows); e == nil {
				_ = h.rdb.Set(c.Context(), adminTrafficCacheKey, b, adminTrafficCacheTTL).Err()
			}
		}
	}

	return c.JSON(trafficPresenceResponse{
		CurrentlyOnline: online,
		Windows:         windows,
		Cached:          cached,
	})
}

func (h *Handler) computeActiveWindows(ctx context.Context) (map[string]activeWindowStat, error) {
	out := map[string]activeWindowStat{}
	type winDef struct {
		key      string
		duration time.Duration
		buckets  int
	}
	windows := []winDef{
		{"1h", time.Hour, 12},
		{"12h", 12 * time.Hour, 12},
		{"24h", 24 * time.Hour, 24},
		{"7d", 7 * 24 * time.Hour, 14},
		{"30d", 30 * 24 * time.Hour, 15},
	}

	now := time.Now().UTC()
	for _, w := range windows {
		var count int64
		err := h.db.QueryRow(ctx, `
			SELECT COUNT(*)::bigint FROM sessions
			WHERE last_seen >= $1`, now.Add(-w.duration)).Scan(&count)
		if err != nil {
			return nil, err
		}
		spark, err := h.sessionSparkline(ctx, now, w.duration, w.buckets)
		if err != nil {
			return nil, err
		}
		out[w.key] = activeWindowStat{Count: count, Sparkline: spark}
	}
	return out, nil
}

func (h *Handler) sessionSparkline(ctx context.Context, now time.Time, window time.Duration, buckets int) ([]int64, error) {
	if buckets < 2 {
		buckets = 2
	}
	bucketDur := window / time.Duration(buckets)
	start := now.Add(-window)
	rows, err := h.db.Query(ctx, `
		SELECT width_bucket(
			EXTRACT(EPOCH FROM last_seen)::float8,
			EXTRACT(EPOCH FROM $1::timestamptz)::float8,
			EXTRACT(EPOCH FROM $2::timestamptz)::float8,
			$3::int
		) AS bucket,
		COUNT(*)::bigint
		FROM sessions
		WHERE last_seen >= $1 AND last_seen <= $2
		GROUP BY bucket
		ORDER BY bucket`, start, now, buckets)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	spark := make([]int64, buckets)
	for rows.Next() {
		var b int
		var n int64
		if err := rows.Scan(&b, &n); err != nil {
			return nil, err
		}
		// width_bucket returns 1..buckets; 0 and buckets+1 are out of range
		if b >= 1 && b <= buckets {
			spark[b-1] = n
		}
	}
	_ = bucketDur
	return spark, nil
}
