package handlers

import (
	"encoding/json"
	"errors"
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

type highlightItem struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	MediaURL string  `json:"media_url"`
	LinkURL  *string `json:"link_url,omitempty"`
	Position int     `json:"position"`
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
}

type blogPostDetail struct {
	blogPostSummary
	Body string `json:"body"`
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
	for rows.Next() {
		var item highlightItem
		if err := rows.Scan(&item.ID, &item.Title, &item.MediaURL, &item.LinkURL, &item.Position); err != nil {
			return internalError(c, "ListHighlights scan", err)
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"highlights": items})
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
		SELECT id, title, slug, cover_image, published_at
		FROM blog_posts WHERE status = 'published'
		ORDER BY published_at DESC NULLS LAST`)
	if err != nil {
		return internalError(c, "ListBlogPosts query", err)
	}
	defer rows.Close()

	posts := make([]blogPostSummary, 0)
	for rows.Next() {
		var p blogPostSummary
		if err := rows.Scan(&p.ID, &p.Title, &p.Slug, &p.CoverImage, &p.PublishedAt); err != nil {
			return internalError(c, "ListBlogPosts scan", err)
		}
		posts = append(posts, p)
	}
	return c.JSON(fiber.Map{"posts": posts})
}

func (h *Handler) GetBlogPost(c *fiber.Ctx) error {
	slug := c.Params("slug")
	var p blogPostDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, title, slug, body, cover_image, published_at
		FROM blog_posts WHERE slug = $1 AND status = 'published'`, slug,
	).Scan(&p.ID, &p.Title, &p.Slug, &p.Body, &p.CoverImage, &p.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "blog post not found")
	}
	if err != nil {
		return internalError(c, "GetBlogPost query", err)
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
