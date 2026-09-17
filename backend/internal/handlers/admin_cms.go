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
	req.Data = h.normalizeContentBlockData(req.Data)

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
	block.Data = h.rewriteContentBlockData(block.Data)
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
	ids := make([]string, 0)
	for rows.Next() {
		var item highlightItem
		if err := rows.Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position); err != nil {
			return internalError(c, "AdminListHighlights scan", err)
		}
		item.MediaURL = h.expandMedia(item.MediaURL)
		item.Slides = []highlightSlideItem{}
		items = append(items, item)
		ids = append(ids, item.ID)
	}
	if err := h.attachHighlightSlides(c, items, ids); err != nil {
		return internalError(c, "AdminListHighlights slides", err)
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
	req.MediaURL = h.normalizeMedia(req.MediaURL)
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminCreateHighlight begin", err)
	}
	defer tx.Rollback(c.Context())

	var id string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO highlights (title, media_url, link_url, position, is_active)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.Title, req.MediaURL, req.LinkURL, req.Position, isActive,
	).Scan(&id)
	if err != nil {
		return internalError(c, "AdminCreateHighlight insert", err)
	}
	_, err = tx.Exec(c.Context(), `
		INSERT INTO highlight_slides (highlight_id, image_url, caption, caption_position, sort_order)
		VALUES ($1, $2, '', 'bottom', 0)`, id, req.MediaURL)
	if err != nil {
		return internalError(c, "AdminCreateHighlight slide", err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminCreateHighlight commit", err)
	}

	item, err := h.loadHighlightItem(c, id)
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
	req.MediaURL = h.normalizeMedia(req.MediaURL)

	tag, err := h.db.Exec(c.Context(), `
		UPDATE highlights SET title = $1, media_url = $2, link_url = $3, position = $4, is_active = $5
		WHERE id = $6`, req.Title, req.MediaURL, req.LinkURL, req.Position, isActive, id)
	if err != nil {
		return internalError(c, "AdminUpdateHighlight update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "highlight not found")
	}

	// Keep primary media_url mirrored onto first slide when present.
	if req.MediaURL != "" {
		_, _ = h.db.Exec(c.Context(), `
			UPDATE highlight_slides SET image_url = $1
			WHERE id = (
				SELECT id FROM highlight_slides
				WHERE highlight_id = $2
				ORDER BY sort_order, id
				LIMIT 1
			)`, req.MediaURL, id)
	}

	item, err := h.loadHighlightItem(c, id)
	if err != nil {
		return internalError(c, "AdminUpdateHighlight load", err)
	}
	return c.JSON(item)
}

func (h *Handler) loadHighlightItem(c *fiber.Ctx, id string) (highlightItem, error) {
	var item highlightItem
	err := h.db.QueryRow(c.Context(), `
		SELECT id, title, media_url, link_url, position FROM highlights WHERE id = $1`, id,
	).Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position)
	if err != nil {
		return item, err
	}
	item.MediaURL = h.expandMedia(item.MediaURL)
	item.Slides = []highlightSlideItem{}
	items := []highlightItem{item}
	if err := h.attachHighlightSlides(c, items, []string{id}); err != nil {
		return item, err
	}
	return items[0], nil
}

type adminHighlightSlideInput struct {
	ImageURL        string  `json:"image_url"`
	Caption         string  `json:"caption"`
	CaptionPosition string  `json:"caption_position"`
	SortOrder       *int    `json:"sort_order"`
	ProductID       *string `json:"product_id"`
}

func (h *Handler) resolveHighlightSlideProductID(c *fiber.Ctx, productID *string) (*string, error) {
	if productID == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*productID)
	if trimmed == "" {
		return nil, nil
	}
	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, trimmed).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, errors.New("product not found")
	}
	return &trimmed, nil
}

type adminHighlightSlidesReorderInput struct {
	SlideIDs []string `json:"slide_ids"`
}

func (h *Handler) AdminCreateHighlightSlide(c *fiber.Ctx) error {
	highlightID := c.Params("id")
	var req adminHighlightSlideInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if strings.TrimSpace(req.ImageURL) == "" {
		return badRequest(c, "image_url is required")
	}
	req.ImageURL = h.normalizeMedia(req.ImageURL)
	pos := normalizeCaptionPosition(req.CaptionPosition)
	productID, err := h.resolveHighlightSlideProductID(c, req.ProductID)
	if err != nil {
		if err.Error() == "product not found" {
			return badRequest(c, "product not found")
		}
		return internalError(c, "AdminCreateHighlightSlide product", err)
	}

	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM highlights WHERE id = $1)`, highlightID).Scan(&exists); err != nil {
		return internalError(c, "AdminCreateHighlightSlide exists", err)
	}
	if !exists {
		return notFound(c, "highlight not found")
	}

	sortOrder := 0
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	} else {
		_ = h.db.QueryRow(c.Context(), `
			SELECT COALESCE(MAX(sort_order), -1) + 1 FROM highlight_slides WHERE highlight_id = $1`, highlightID,
		).Scan(&sortOrder)
	}

	var slide highlightSlideItem
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO highlight_slides (highlight_id, image_url, caption, caption_position, sort_order, product_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, image_url, caption, caption_position, sort_order, product_id`,
		highlightID, req.ImageURL, req.Caption, pos, sortOrder, productID,
	).Scan(&slide.ID, &slide.ImageURL, &slide.Caption, &slide.CaptionPosition, &slide.SortOrder, &slide.ProductID)
	if err != nil {
		return internalError(c, "AdminCreateHighlightSlide insert", err)
	}
	slide.ImageURL = h.expandMedia(slide.ImageURL)
	if slide.ProductID != nil {
		_ = h.db.QueryRow(c.Context(), `SELECT slug FROM products WHERE id = $1`, *slide.ProductID).Scan(&slide.ProductSlug)
	}
	_ = h.syncHighlightPrimaryMedia(c, highlightID)
	return c.Status(fiber.StatusCreated).JSON(slide)
}

func (h *Handler) AdminUpdateHighlightSlide(c *fiber.Ctx) error {
	highlightID := c.Params("id")
	slideID := c.Params("slideId")
	var req adminHighlightSlideInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if strings.TrimSpace(req.ImageURL) == "" {
		return badRequest(c, "image_url is required")
	}
	req.ImageURL = h.normalizeMedia(req.ImageURL)
	pos := normalizeCaptionPosition(req.CaptionPosition)
	productID, err := h.resolveHighlightSlideProductID(c, req.ProductID)
	if err != nil {
		if err.Error() == "product not found" {
			return badRequest(c, "product not found")
		}
		return internalError(c, "AdminUpdateHighlightSlide product", err)
	}
	tag, err := h.db.Exec(c.Context(), `
		UPDATE highlight_slides
		SET image_url = $1,
		    caption = $2,
		    caption_position = $3,
		    sort_order = CASE WHEN $4::int IS NULL THEN sort_order ELSE $4::int END,
		    product_id = $5
		WHERE id = $6 AND highlight_id = $7`,
		req.ImageURL, req.Caption, pos, req.SortOrder, productID, slideID, highlightID)
	if err != nil {
		return internalError(c, "AdminUpdateHighlightSlide update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "slide not found")
	}

	var slide highlightSlideItem
	err = h.db.QueryRow(c.Context(), `
		SELECT s.id, s.image_url, s.caption, s.caption_position, s.sort_order, s.product_id, p.slug
		FROM highlight_slides s
		LEFT JOIN products p ON p.id = s.product_id
		WHERE s.id = $1`, slideID,
	).Scan(
		&slide.ID, &slide.ImageURL, &slide.Caption, &slide.CaptionPosition, &slide.SortOrder,
		&slide.ProductID, &slide.ProductSlug,
	)
	if err != nil {
		return internalError(c, "AdminUpdateHighlightSlide load", err)
	}
	slide.ImageURL = h.expandMedia(slide.ImageURL)
	_ = h.syncHighlightPrimaryMedia(c, highlightID)
	return c.JSON(slide)
}

func (h *Handler) AdminDeleteHighlightSlide(c *fiber.Ctx) error {
	highlightID := c.Params("id")
	slideID := c.Params("slideId")
	tag, err := h.db.Exec(c.Context(), `
		DELETE FROM highlight_slides WHERE id = $1 AND highlight_id = $2`, slideID, highlightID)
	if err != nil {
		return internalError(c, "AdminDeleteHighlightSlide delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "slide not found")
	}
	_ = h.syncHighlightPrimaryMedia(c, highlightID)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) AdminReorderHighlightSlides(c *fiber.Ctx) error {
	highlightID := c.Params("id")
	var req adminHighlightSlidesReorderInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if len(req.SlideIDs) == 0 {
		return badRequest(c, "slide_ids required")
	}
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminReorderHighlightSlides begin", err)
	}
	defer tx.Rollback(c.Context())

	for i, sid := range req.SlideIDs {
		tag, err := tx.Exec(c.Context(), `
			UPDATE highlight_slides SET sort_order = $1
			WHERE id = $2 AND highlight_id = $3`, i, sid, highlightID)
		if err != nil {
			return internalError(c, "AdminReorderHighlightSlides update", err)
		}
		if tag.RowsAffected() == 0 {
			return badRequest(c, "invalid slide_id")
		}
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminReorderHighlightSlides commit", err)
	}
	_ = h.syncHighlightPrimaryMedia(c, highlightID)
	item, err := h.loadHighlightItem(c, highlightID)
	if err != nil {
		return internalError(c, "AdminReorderHighlightSlides load", err)
	}
	return c.JSON(item)
}

func (h *Handler) syncHighlightPrimaryMedia(c *fiber.Ctx, highlightID string) error {
	var imageURL string
	err := h.db.QueryRow(c.Context(), `
		SELECT image_url FROM highlight_slides
		WHERE highlight_id = $1
		ORDER BY sort_order, id
		LIMIT 1`, highlightID).Scan(&imageURL)
	if err != nil {
		return err
	}
	_, err = h.db.Exec(c.Context(), `UPDATE highlights SET media_url = $1 WHERE id = $2`, imageURL, highlightID)
	return err
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
		SELECT id, title, slug, body, cover_image, status, published_at
		FROM blog_posts ORDER BY created_at DESC`)
	if err != nil {
		return internalError(c, "AdminListBlogPosts query", err)
	}
	defer rows.Close()

	posts := make([]blogPostDetail, 0)
	for rows.Next() {
		var p blogPostDetail
		if err := rows.Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.Status, &p.PublishedAt); err != nil {
			return internalError(c, "AdminListBlogPosts scan", err)
		}
		p.CoverImage = h.expandMediaPtr(p.CoverImage)
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
	publishedAt := req.PublishedAt
	if status == "published" && publishedAt == nil {
		now := time.Now().UTC()
		publishedAt = &now
	}
	req.CoverImage = h.normalizeMediaPtr(req.CoverImage)

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO blog_posts (title, slug, body, cover_image, status, published_at)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		req.Title, req.Slug, req.Body, req.CoverImage, status, publishedAt,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminCreateBlogPost insert", err)
	}

	return h.adminGetBlogPostByID(c.Status(fiber.StatusCreated), id)
}

func (h *Handler) AdminGetBlogPost(c *fiber.Ctx) error {
	return h.adminGetBlogPostByID(c, c.Params("id"))
}

func (h *Handler) adminGetBlogPostByID(c *fiber.Ctx, id string) error {
	var p blogPostDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, title, slug, body, cover_image, status, published_at
		FROM blog_posts WHERE id = $1`, id,
	).Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.Status, &p.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "blog post not found")
	}
	if err != nil {
		return internalError(c, "adminGetBlogPostByID query", err)
	}
	p.CoverImage = h.expandMediaPtr(p.CoverImage)
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
	req.CoverImage = h.normalizeMediaPtr(req.CoverImage)

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
