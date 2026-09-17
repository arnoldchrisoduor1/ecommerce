package handlers

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type contentBlockResponse struct {
	Key       string          `json:"key"`
	Data      json.RawMessage `json:"data"`
	IsActive  bool            `json:"is_active"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type highlightSlideItem struct {
	ID              string  `json:"id"`
	ImageURL        string  `json:"image_url"`
	Caption         string  `json:"caption"`
	CaptionPosition string  `json:"caption_position"`
	SortOrder       int     `json:"sort_order"`
	ProductID       *string `json:"product_id,omitempty"`
	ProductSlug     *string `json:"product_slug,omitempty"`
}

type highlightItem struct {
	ID       string               `json:"id"`
	Title    string               `json:"title"`
	MediaURL string               `json:"media_url"`
	LinkURL  *string              `json:"link_url,omitempty"`
	Position int                  `json:"position"`
	Slides   []highlightSlideItem `json:"slides"`
}

var allowedCaptionPositions = map[string]bool{
	"top": true, "centre": true, "bottom": true,
}

func normalizeCaptionPosition(pos string) string {
	p := strings.TrimSpace(strings.ToLower(pos))
	if p == "center" {
		p = "centre"
	}
	if allowedCaptionPositions[p] {
		return p
	}
	return "bottom"
}

type curatedShelfProduct struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`
	BasePrice    float64       `json:"base_price"`
	SalePrice    *float64      `json:"sale_price,omitempty"`
	Position     int           `json:"position"`
	PrimaryImage *productImage `json:"primary_image,omitempty"`
}

type curatedShelfResponse struct {
	Key      string                `json:"key"`
	Title    string                `json:"title"`
	Products []curatedShelfProduct `json:"products"`
}

type blogPostSummary struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	CoverImage  *string    `json:"cover_image,omitempty"`
	Status      string     `json:"status,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	TotalReads  int64      `json:"total_reads"`
}

type blogPostDetail struct {
	blogPostSummary
	Body              string `json:"body"`
	CurrentlyReading  int64  `json:"currently_reading"`
}

type statsCounterResponse struct {
	Key               string `json:"key"`
	Value             int64  `json:"value"`
	IsManualOverride  bool   `json:"is_manual_override"`
}

func (h *Handler) GetContentBlock(c *fiber.Ctx) error {
	key := c.Params("key")
	var block contentBlockResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT key, data, is_active, updated_at
		FROM content_blocks WHERE key = $1 AND is_active = true`, key,
	).Scan(&block.Key, &block.Data, &block.IsActive, &block.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "content block not found")
	}
	if err != nil {
		return internalError(c, "GetContentBlock query", err)
	}
	block.Data = h.rewriteContentBlockData(block.Data)
	return c.JSON(block)
}

func (h *Handler) ListHighlights(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, title, media_url, link_url, position
		FROM highlights WHERE is_active = true ORDER BY position`)
	if err != nil {
		return internalError(c, "ListHighlights query", err)
	}
	defer rows.Close()

	items := make([]highlightItem, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var item highlightItem
		if err := rows.Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position); err != nil {
			return internalError(c, "ListHighlights scan", err)
		}
		item.MediaURL = h.expandMedia(item.MediaURL)
		item.Slides = []highlightSlideItem{}
		items = append(items, item)
		ids = append(ids, item.ID)
	}
	if err := h.attachHighlightSlides(c, items, ids); err != nil {
		return internalError(c, "ListHighlights slides", err)
	}
	return c.JSON(fiber.Map{"highlights": items})
}

func (h *Handler) attachHighlightSlides(c *fiber.Ctx, items []highlightItem, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT s.id, s.highlight_id, s.image_url, s.caption, s.caption_position, s.sort_order,
		       s.product_id, p.slug
		FROM highlight_slides s
		LEFT JOIN products p ON p.id = s.product_id
		WHERE s.highlight_id = ANY($1::uuid[])
		ORDER BY s.highlight_id, s.sort_order, s.id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	byHighlight := make(map[string][]highlightSlideItem, len(ids))
	for rows.Next() {
		var slide highlightSlideItem
		var highlightID string
		if err := rows.Scan(
			&slide.ID, &highlightID, &slide.ImageURL, &slide.Caption, &slide.CaptionPosition, &slide.SortOrder,
			&slide.ProductID, &slide.ProductSlug,
		); err != nil {
			return err
		}
		slide.ImageURL = h.expandMedia(slide.ImageURL)
		byHighlight[highlightID] = append(byHighlight[highlightID], slide)
	}
	for i := range items {
		if slides, ok := byHighlight[items[i].ID]; ok {
			items[i].Slides = slides
			if len(slides) > 0 {
				items[i].MediaURL = slides[0].ImageURL
			}
		} else if items[i].Slides == nil {
			items[i].Slides = []highlightSlideItem{}
		}
	}
	return nil
}

func (h *Handler) GetCuratedShelf(c *fiber.Ctx) error {
	key := c.Params("key")
	var shelf curatedShelfResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT key, title FROM curated_shelves WHERE key = $1 AND is_active = true`, key,
	).Scan(&shelf.Key, &shelf.Title)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "shelf not found")
	}
	if err != nil {
		return internalError(c, "GetCuratedShelf query shelf", err)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, csi.position
		FROM curated_shelf_items csi
		JOIN products p ON p.id = csi.product_id
		JOIN curated_shelves cs ON cs.id = csi.shelf_id
		WHERE cs.key = $1 AND p.status = 'active'
		ORDER BY csi.position`, key)
	if err != nil {
		return internalError(c, "GetCuratedShelf query items", err)
	}
	defer rows.Close()

	shelf.Products = make([]curatedShelfProduct, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var p curatedShelfProduct
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.BasePrice, &p.SalePrice, &p.Position); err != nil {
			return internalError(c, "GetCuratedShelf scan", err)
		}
		shelf.Products = append(shelf.Products, p)
		ids = append(ids, p.ID)
	}

	if len(ids) > 0 {
		images, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "GetCuratedShelf images", err)
		}
		h.expandPrimaryImageMap(images)
		for i := range shelf.Products {
			if img, ok := images[shelf.Products[i].ID]; ok {
				shelf.Products[i].PrimaryImage = img
			}
		}
	}
	return c.JSON(shelf)
}

func (h *Handler) ListBlogPosts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.title, p.slug, p.cover_image, p.published_at,
			COALESCE((SELECT COUNT(*) FROM blog_reads br WHERE br.post_id = p.id), 0)::bigint
		FROM blog_posts p WHERE p.status = 'published'
		ORDER BY p.published_at DESC NULLS LAST`)
	if err != nil {
		return internalError(c, "ListBlogPosts query", err)
	}
	defer rows.Close()

	posts := make([]blogPostSummary, 0)
	for rows.Next() {
		var p blogPostSummary
		if err := rows.Scan(&p.ID, &p.Title, &p.Slug, &p.CoverImage, &p.PublishedAt, &p.TotalReads); err != nil {
			return internalError(c, "ListBlogPosts scan", err)
		}
		p.CoverImage = h.expandMediaPtr(p.CoverImage)
		posts = append(posts, p)
	}
	return c.JSON(fiber.Map{"posts": posts})
}

func (h *Handler) GetBlogPost(c *fiber.Ctx) error {
	slug := c.Params("slug")
	var p blogPostDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT p.id, p.title, p.slug, p.body, p.cover_image, p.published_at,
			COALESCE((SELECT COUNT(*) FROM blog_reads br WHERE br.post_id = p.id), 0)::bigint
		FROM blog_posts p WHERE p.slug = $1 AND p.status = 'published'`, slug,
	).Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.PublishedAt, &p.TotalReads)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "blog post not found")
	}
	if err != nil {
		return internalError(c, "GetBlogPost query", err)
	}
	p.CoverImage = h.expandMediaPtr(p.CoverImage)
	if h.rdb != nil {
		if n, e := h.blogPresenceCount(c, p.ID); e == nil {
			p.CurrentlyReading = n
		}
	} else {
		_ = h.db.QueryRow(c.Context(), `
			SELECT COUNT(*)::bigint FROM blog_reads
			WHERE post_id = $1 AND last_seen >= now() - interval '5 minutes'`, p.ID,
		).Scan(&p.CurrentlyReading)
	}
	return c.JSON(p)
}

func (h *Handler) GetStatsCounters(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `SELECT key, value, is_manual_override FROM stats_counters ORDER BY key`)
	if err != nil {
		return internalError(c, "GetStatsCounters query", err)
	}
	defer rows.Close()

	counters := make([]statsCounterResponse, 0)
	for rows.Next() {
		var sc statsCounterResponse
		if err := rows.Scan(&sc.Key, &sc.Value, &sc.IsManualOverride); err != nil {
			return internalError(c, "GetStatsCounters scan", err)
		}
		counters = append(counters, sc)
	}
	return c.JSON(fiber.Map{"counters": counters})
}
