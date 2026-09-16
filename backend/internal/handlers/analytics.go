package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type analyticsStartRequest struct {
	SessionID  string  `json:"session_id"`
	Path       string  `json:"path"`
	EntityType string  `json:"entity_type"`
	EntityID   *string `json:"entity_id"`
	Referrer   *string `json:"referrer"`
	UserID     *string `json:"user_id"`
}

type analyticsHeartbeatRequest struct {
	SessionID string `json:"session_id"`
	Visible   *bool  `json:"visible"`
	Seconds   *int   `json:"seconds"` // optional explicit delta; default 15
}

type analyticsCloseRequest struct {
	SessionID string `json:"session_id"`
	Seconds   *int   `json:"seconds"`
}

func analyticsIPSalt() string {
	if v := strings.TrimSpace(os.Getenv("ANALYTICS_IP_SALT")); v != "" {
		return v
	}
	if v := strings.TrimSpace(os.Getenv("ADMIN_JWT_SECRET")); v != "" {
		return v
	}
	return "dev-analytics-salt"
}

func hashIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(ip + "|" + analyticsIPSalt()))
	return hex.EncodeToString(sum[:])
}

func normalizeEntityType(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "product", "blog", "page":
		return strings.ToLower(strings.TrimSpace(t))
	default:
		return "page"
	}
}

func (h *Handler) resolveEntityFromPath(ctx context.Context, path string, hintType string, hintID *string) (string, *string) {
	if hintID != nil && strings.TrimSpace(*hintID) != "" {
		return normalizeEntityType(hintType), hintID
	}
	path = strings.TrimSpace(path)
	if strings.HasPrefix(path, "/product/") {
		slug := strings.TrimPrefix(path, "/product/")
		if i := strings.IndexByte(slug, '?'); i >= 0 {
			slug = slug[:i]
		}
		slug = strings.Trim(slug, "/")
		var id string
		if err := h.db.QueryRow(ctx, `SELECT id FROM products WHERE slug = $1`, slug).Scan(&id); err == nil {
			return "product", &id
		}
		return "product", nil
	}
	if strings.HasPrefix(path, "/blog/") {
		slug := strings.TrimPrefix(path, "/blog/")
		if i := strings.IndexByte(slug, '?'); i >= 0 {
			slug = slug[:i]
		}
		slug = strings.Trim(slug, "/")
		if slug != "" {
			var id string
			if err := h.db.QueryRow(ctx, `SELECT id FROM blog_posts WHERE slug = $1`, slug).Scan(&id); err == nil {
				return "blog", &id
			}
			return "blog", nil
		}
	}
	return "page", nil
}

func (h *Handler) upsertAnalyticsSession(ctx context.Context, sessionID, ipHash string, userID *string) error {
	_, err := h.db.Exec(ctx, `
		INSERT INTO sessions (id, user_id, first_seen, last_seen, ip_hash)
		VALUES ($1, $2, now(), now(), $3)
		ON CONFLICT (id) DO UPDATE SET
			last_seen = now(),
			ip_hash = COALESCE(EXCLUDED.ip_hash, sessions.ip_hash),
			user_id = COALESCE(EXCLUDED.user_id, sessions.user_id)`,
		sessionID, userID, nullIfEmpty(ipHash))
	return err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// AnalyticsStartPageView creates a page_views row (sync — returns id for heartbeats).
func (h *Handler) AnalyticsStartPageView(c *fiber.Ctx) error {
	var req analyticsStartRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	path := strings.TrimSpace(req.Path)
	if sessionID == "" || path == "" {
		return badRequest(c, "session_id and path are required")
	}
	if len(sessionID) > 128 || len(path) > 2048 {
		return badRequest(c, "session_id or path too long")
	}

	ipHash := hashIP(c.IP())
	ua := string(c.Request().Header.UserAgent())
	entityType, entityID := h.resolveEntityFromPath(c.Context(), path, req.EntityType, req.EntityID)

	if err := h.upsertAnalyticsSession(c.Context(), sessionID, ipHash, req.UserID); err != nil {
		return internalError(c, "AnalyticsStartPageView session", err)
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO page_views (
			session_id, user_id, path, entity_type, entity_id,
			referrer, user_agent, ip_hash
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		sessionID, req.UserID, path, entityType, entityID,
		req.Referrer, nullIfEmpty(ua), nullIfEmpty(ipHash),
	).Scan(&id)
	if err != nil {
		return internalError(c, "AnalyticsStartPageView insert", err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

// AnalyticsHeartbeatPageView increments duration when the tab is visible.
func (h *Handler) AnalyticsHeartbeatPageView(c *fiber.Ctx) error {
	viewID := c.Params("id")
	if _, err := uuid.Parse(viewID); err != nil {
		return badRequest(c, "invalid page view id")
	}
	var req analyticsHeartbeatRequest
	if err := c.BodyParser(&req); err != nil {
		// allow empty body
		req = analyticsHeartbeatRequest{}
	}
	visible := true
	if req.Visible != nil {
		visible = *req.Visible
	}
	if !visible {
		return c.JSON(fiber.Map{"ok": true, "skipped": true})
	}
	seconds := 15
	if req.Seconds != nil && *req.Seconds > 0 && *req.Seconds <= 120 {
		seconds = *req.Seconds
	}

	// Non-blocking write relative to client UX — still sync here but cheap.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		tag, err := h.db.Exec(ctx, `
			UPDATE page_views
			SET duration_seconds = duration_seconds + $1
			WHERE id = $2 AND ended_at IS NULL`, seconds, viewID)
		if err != nil {
			log.Printf("AnalyticsHeartbeatPageView: %v", err)
			return
		}
		if tag.RowsAffected() == 0 {
			return
		}
		if sid := strings.TrimSpace(req.SessionID); sid != "" {
			_, _ = h.db.Exec(ctx, `UPDATE sessions SET last_seen = now() WHERE id = $1`, sid)
		} else {
			_, _ = h.db.Exec(ctx, `
				UPDATE sessions SET last_seen = now()
				WHERE id = (SELECT session_id FROM page_views WHERE id = $1)`, viewID)
		}
	}()
	return c.JSON(fiber.Map{"ok": true})
}

// AnalyticsClosePageView finalizes a page view (supports sendBeacon JSON).
func (h *Handler) AnalyticsClosePageView(c *fiber.Ctx) error {
	viewID := c.Params("id")
	if _, err := uuid.Parse(viewID); err != nil {
		return badRequest(c, "invalid page view id")
	}
	var req analyticsCloseRequest
	body := c.Body()
	if len(body) > 0 {
		_ = json.Unmarshal(body, &req)
	}
	extra := 0
	if req.Seconds != nil && *req.Seconds > 0 && *req.Seconds <= 120 {
		extra = *req.Seconds
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, err := h.db.Exec(ctx, `
			UPDATE page_views
			SET ended_at = COALESCE(ended_at, now()),
			    duration_seconds = duration_seconds + $1
			WHERE id = $2`, extra, viewID)
		if err != nil {
			log.Printf("AnalyticsClosePageView: %v", err)
			return
		}
		if sid := strings.TrimSpace(req.SessionID); sid != "" {
			_, _ = h.db.Exec(ctx, `UPDATE sessions SET last_seen = now() WHERE id = $1`, sid)
		}
	}()
	return c.JSON(fiber.Map{"ok": true})
}

// --- Admin most-viewed ---

type mostViewedProduct struct {
	Rank          int     `json:"rank"`
	ProductID     string  `json:"product_id"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	ThumbnailURL  *string `json:"thumbnail_url,omitempty"`
	TotalViews    int64   `json:"total_views"`
	UniqueViewers int64   `json:"unique_viewers"`
	AvgSeconds    float64 `json:"avg_seconds"`
}

type productViewerRow struct {
	Label         string    `json:"label"`
	SessionID     string    `json:"session_id"`
	UserID        *string   `json:"-"` // never public in admin JSON? Spec allows modal with name — omit raw if guest
	ViewCount     int64     `json:"view_count"`
	TotalSeconds  int64     `json:"total_seconds"`
	LastViewedAt  time.Time `json:"last_viewed_at"`
}

func viewerLabel(fullName *string, sessionID string) string {
	if fullName != nil {
		name := strings.TrimSpace(*fullName)
		if name != "" {
			return strings.Fields(name)[0]
		}
	}
	short := sessionID
	if len(short) > 6 {
		short = short[:6]
	}
	return "Guest · session " + short
}

func parseDateRange(c *fiber.Ctx) (time.Time, time.Time, error) {
	now := time.Now().UTC()
	to := now
	from := now.AddDate(0, 0, -7)
	if v := c.Query("from"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		from = t.UTC()
	}
	if v := c.Query("to"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		// inclusive end-of-day
		to = t.UTC().Add(24*time.Hour - time.Nanosecond)
	}
	return from, to, nil
}

// AdminMostViewedProducts lists products by page_views in a date range.
func (h *Handler) AdminMostViewedProducts(c *fiber.Ctx) error {
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
			p.id,
			p.name,
			p.slug,
			(
				SELECT pi.url FROM product_images pi
				WHERE pi.product_id = p.id
				ORDER BY pi.position, pi.id
				LIMIT 1
			) AS thumb,
			COUNT(*)::bigint AS total_views,
			COUNT(DISTINCT pv.session_id)::bigint AS unique_viewers,
			COALESCE(AVG(pv.duration_seconds), 0)::float8 AS avg_seconds
		FROM page_views pv
		JOIN products p ON p.id = pv.entity_id
		WHERE pv.entity_type = 'product'
		  AND pv.entity_id IS NOT NULL
		  AND pv.started_at >= $1 AND pv.started_at <= $2
		GROUP BY p.id, p.name, p.slug
		ORDER BY total_views DESC, p.name
		LIMIT $3`, from, to, limit)
	if err != nil {
		return internalError(c, "AdminMostViewedProducts query", err)
	}
	defer rows.Close()

	items := make([]mostViewedProduct, 0)
	rank := 0
	for rows.Next() {
		rank++
		var item mostViewedProduct
		var thumb *string
		if err := rows.Scan(&item.ProductID, &item.Name, &item.Slug, &thumb,
			&item.TotalViews, &item.UniqueViewers, &item.AvgSeconds); err != nil {
			return internalError(c, "AdminMostViewedProducts scan", err)
		}
		item.Rank = rank
		if thumb != nil && *thumb != "" {
			u := h.expandMedia(*thumb)
			item.ThumbnailURL = &u
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{
		"products": items,
		"from":     from.Format("2006-01-02"),
		"to":       to.Format("2006-01-02"),
	})
}

// AdminProductViewers lists per-session viewers for a product.
func (h *Handler) AdminProductViewers(c *fiber.Ctx) error {
	productID := c.Params("id")
	if _, err := uuid.Parse(productID); err != nil {
		return badRequest(c, "invalid product id")
	}
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	page := 1
	pageSize := 20
	if v := c.Query("page"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 {
			page = n
		}
	}
	if v := c.Query("page_size"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 100 {
			pageSize = n
		}
	}
	sort := strings.ToLower(c.Query("sort", "last_viewed"))
	orderSQL := "last_viewed_at DESC"
	switch sort {
	case "views":
		orderSQL = "view_count DESC, last_viewed_at DESC"
	case "time":
		orderSQL = "total_seconds DESC, last_viewed_at DESC"
	case "name":
		orderSQL = "full_name ASC NULLS LAST, last_viewed_at DESC"
	}

	offset := (page - 1) * pageSize

	var total int64
	err = h.db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM (
			SELECT pv.session_id
			FROM page_views pv
			WHERE pv.entity_type = 'product' AND pv.entity_id = $1
			  AND pv.started_at >= $2 AND pv.started_at <= $3
			GROUP BY pv.session_id
		) t`, productID, from, to).Scan(&total)
	if err != nil {
		return internalError(c, "AdminProductViewers count", err)
	}

	q := `
		SELECT
			pv.session_id,
			MAX(c.full_name) AS full_name,
			COUNT(*)::bigint AS view_count,
			COALESCE(SUM(pv.duration_seconds), 0)::bigint AS total_seconds,
			MAX(pv.started_at) AS last_viewed_at
		FROM page_views pv
		LEFT JOIN customers c ON c.id = pv.user_id
		WHERE pv.entity_type = 'product' AND pv.entity_id = $1
		  AND pv.started_at >= $2 AND pv.started_at <= $3
		GROUP BY pv.session_id
		ORDER BY ` + orderSQL + `
		LIMIT $4 OFFSET $5`

	rows, err := h.db.Query(c.Context(), q, productID, from, to, pageSize, offset)
	if err != nil {
		return internalError(c, "AdminProductViewers query", err)
	}
	defer rows.Close()

	viewers := make([]productViewerRow, 0)
	for rows.Next() {
		var row productViewerRow
		var fullName *string
		if err := rows.Scan(&row.SessionID, &fullName, &row.ViewCount, &row.TotalSeconds, &row.LastViewedAt); err != nil {
			return internalError(c, "AdminProductViewers scan", err)
		}
		row.Label = viewerLabel(fullName, row.SessionID)
		viewers = append(viewers, row)
	}

	return c.JSON(fiber.Map{
		"viewers":   viewers,
		"page":      page,
		"page_size": pageSize,
		"total":     total,
		"from":      from.Format("2006-01-02"),
		"to":        to.Format("2006-01-02"),
	})
}
