package handlers

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminContentBlockInput struct {
	Data     json.RawMessage `json:"data"`
	IsActive *bool           `json:"is_active"`
}

type adminHighlightInput struct {
	Title    string  `json:"title"`
	MediaURL string  `json:"media_url"`
	LinkURL  *string `json:"link_url"`
	Position int     `json:"position"`
	IsActive *bool   `json:"is_active"`
}

type adminCuratedShelfInput struct {
	Title      string   `json:"title"`
	ProductIDs []string `json:"product_ids"`
	IsActive   *bool    `json:"is_active"`
}

type adminBlogPostInput struct {
	Title       string  `json:"title"`
	Slug        string  `json:"slug"`
	Body        string  `json:"body"`
	CoverImage  *string `json:"cover_image"`
	Status      string  `json:"status"`
	PublishedAt *time.Time `json:"published_at"`
}

type adminStatsCounterInput struct {
	Value            int64 `json:"value"`
	IsManualOverride bool  `json:"is_manual_override"`
}

func (h *Handler) AdminUpdateContentBlock(c *fiber.Ctx) error {
	key := c.Params("key")
	var req adminContentBlockInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if len(req.Data) == 0 {
		return badRequest(c, "data is required")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var block contentBlockResponse
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO content_blocks (key, data, is_active)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, is_active = EXCLUDED.is_active, updated_at = now()
		RETURNING key, data, is_active, updated_at`, key, req.Data, isActive,
	).Scan(&block.Key, &block.Data, &block.IsActive, &block.UpdatedAt)
	if err != nil {
		return internalError(c, "AdminUpdateContentBlock upsert", err)
	}
	return c.JSON(block)
}

func (h *Handler) AdminListHighlights(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, title, media_url, link_url, position
		FROM highlights ORDER BY position`)
	if err != nil {
		return internalError(c, "AdminListHighlights query", err)
	}
	defer rows.Close()

	items := make([]highlightItem, 0)
	for rows.Next() {
		var item highlightItem
		if err := rows.Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position); err != nil {
			return internalError(c, "AdminListHighlights scan", err)
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"highlights": items})
}

func (h *Handler) AdminCreateHighlight(c *fiber.Ctx) error {
	var req adminHighlightInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Title == "" || req.MediaURL == "" {
		return badRequest(c, "title and media_url are required")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO highlights (title, media_url, link_url, position, is_active)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.Title, req.MediaURL, req.LinkURL, req.Position, isActive,
	).Scan(&id)
	if err != nil {
		return internalError(c, "AdminCreateHighlight insert", err)
	}

	var item highlightItem
	err = h.db.QueryRow(c.Context(), `
		SELECT id, title, media_url, link_url, position FROM highlights WHERE id = $1`, id,
	).Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position)
	if err != nil {
		return internalError(c, "AdminCreateHighlight load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *Handler) AdminUpdateHighlight(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminHighlightInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE highlights SET title = $1, media_url = $2, link_url = $3, position = $4, is_active = $5
		WHERE id = $6`, req.Title, req.MediaURL, req.LinkURL, req.Position, isActive, id)
	if err != nil {
		return internalError(c, "AdminUpdateHighlight update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "highlight not found")
	}

	var item highlightItem
	err = h.db.QueryRow(c.Context(), `
		SELECT id, title, media_url, link_url, position FROM highlights WHERE id = $1`, id,
	).Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position)
	if err != nil {
		return internalError(c, "AdminUpdateHighlight load", err)
	}
	return c.JSON(item)
}

func (h *Handler) AdminDeleteHighlight(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(), `DELETE FROM highlights WHERE id = $1`, id)
	if err != nil {
		return internalError(c, "AdminDeleteHighlight delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "highlight not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) AdminUpdateCuratedShelf(c *fiber.Ctx) error {
	key := c.Params("key")
	var req adminCuratedShelfInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Title == "" {
		return badRequest(c, "title is required")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminUpdateCuratedShelf begin", err)
	}
	defer tx.Rollback(c.Context())

	var shelfID string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO curated_shelves (key, title, is_active)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, is_active = EXCLUDED.is_active
		RETURNING id`, key, req.Title, isActive,
	).Scan(&shelfID)
	if err != nil {
		return internalError(c, "AdminUpdateCuratedShelf upsert shelf", err)
	}

	if _, err := tx.Exec(c.Context(), `DELETE FROM curated_shelf_items WHERE shelf_id = $1`, shelfID); err != nil {
		return internalError(c, "AdminUpdateCuratedShelf clear items", err)
	}

	for i, pid := range req.ProductIDs {
		if pid == "" {
			continue
		}
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO curated_shelf_items (shelf_id, product_id, position)
			VALUES ($1, $2, $3)`, shelfID, pid, i); err != nil {
			return internalError(c, "AdminUpdateCuratedShelf insert item", err)
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminUpdateCuratedShelf commit", err)
	}

	return h.GetCuratedShelf(c)
}

func (h *Handler) AdminSetStatsCounter(c *fiber.Ctx) error {
	key := c.Params("key")
	var req adminStatsCounterInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}

	var sc statsCounterResponse
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO stats_counters (key, value, is_manual_override)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_manual_override = EXCLUDED.is_manual_override
		RETURNING key, value, is_manual_override`, key, req.Value, req.IsManualOverride,
	).Scan(&sc.Key, &sc.Value, &sc.IsManualOverride)
	if err != nil {
		return internalError(c, "AdminSetStatsCounter upsert", err)
	}
	return c.JSON(sc)
}

func (h *Handler) AdminListBlogPosts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, title, slug, cover_image, published_at
		FROM blog_posts ORDER BY created_at DESC`)
	if err != nil {
		return internalError(c, "AdminListBlogPosts query", err)
	}
	defer rows.Close()

	posts := make([]blogPostSummary, 0)
	for rows.Next() {
		var p blogPostSummary
		if err := rows.Scan(&p.ID, &p.Title, &p.Slug, &p.CoverImage, &p.PublishedAt); err != nil {
			return internalError(c, "AdminListBlogPosts scan", err)
		}
		posts = append(posts, p)
	}
	return c.JSON(fiber.Map{"posts": posts})
}

func (h *Handler) AdminCreateBlogPost(c *fiber.Ctx) error {
	var req adminBlogPostInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.Slug = normalizeSlug(req.Slug)
	if req.Title == "" || req.Slug == "" || req.Body == "" {
		return badRequest(c, "title, slug, and body are required")
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "published" {
		return badRequest(c, "invalid status")
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO blog_posts (title, slug, body, cover_image, status, published_at)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		req.Title, req.Slug, req.Body, req.CoverImage, status, req.PublishedAt,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminCreateBlogPost insert", err)
	}

	var p blogPostDetail
	err = h.db.QueryRow(c.Context(), `
		SELECT id, title, slug, body, cover_image, published_at
		FROM blog_posts WHERE id = $1`, id,
	).Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.PublishedAt)
	if err != nil {
		return internalError(c, "AdminCreateBlogPost load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(p)
}

func (h *Handler) adminGetBlogPostByID(c *fiber.Ctx, id string) error {
	var p blogPostDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, title, slug, body, cover_image, published_at
		FROM blog_posts WHERE id = $1`, id,
	).Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "blog post not found")
	}
	if err != nil {
		return internalError(c, "adminGetBlogPostByID query", err)
	}
	return c.JSON(p)
}

func (h *Handler) AdminUpdateBlogPost(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminBlogPostInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	status := req.Status
	if status != "" && status != "draft" && status != "published" {
		return badRequest(c, "invalid status")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE blog_posts SET
			title = COALESCE(NULLIF($1, ''), title),
			slug = COALESCE(NULLIF($2, ''), slug),
			body = COALESCE(NULLIF($3, ''), body),
			cover_image = $4,
			status = COALESCE(NULLIF($5, ''), status),
			published_at = COALESCE($6, published_at)
		WHERE id = $7`,
		req.Title, normalizeSlug(req.Slug), req.Body, req.CoverImage, status, req.PublishedAt, id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminUpdateBlogPost update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "blog post not found")
	}
	return h.adminGetBlogPostByID(c, id)
}

func (h *Handler) AdminDeleteBlogPost(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(), `DELETE FROM blog_posts WHERE id = $1`, id)
	if err != nil {
		return internalError(c, "AdminDeleteBlogPost delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "blog post not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
