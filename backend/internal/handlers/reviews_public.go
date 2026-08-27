package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type publicReview struct {
	ID           string    `json:"id"`
	ProductID    string    `json:"product_id"`
	CustomerName string    `json:"customer_name"`
	Rating       int       `json:"rating"`
	Body         *string   `json:"body,omitempty"`
	IsFeatured   bool      `json:"is_featured"`
	CreatedAt    time.Time `json:"created_at"`
}

type submitReviewRequest struct {
	CustomerName string  `json:"customer_name"`
	Rating       int     `json:"rating"`
	Body         *string `json:"body"`
}

func (h *Handler) ListFeaturedReviews(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, product_id, customer_name, rating, body, is_featured, created_at
		FROM reviews
		WHERE is_featured = true AND status = 'approved'
		ORDER BY created_at DESC
		LIMIT 20`)
	if err != nil {
		return internalError(c, "ListFeaturedReviews query", err)
	}
	defer rows.Close()

	reviews := make([]publicReview, 0)
	for rows.Next() {
		var r publicReview
		if err := rows.Scan(&r.ID, &r.ProductID, &r.CustomerName, &r.Rating, &r.Body, &r.IsFeatured, &r.CreatedAt); err != nil {
			return internalError(c, "ListFeaturedReviews scan", err)
		}
		reviews = append(reviews, r)
	}
	return c.JSON(fiber.Map{"reviews": reviews})
}

func (h *Handler) ListProductReviews(c *fiber.Ctx) error {
	productID := c.Params("productId")
	rows, err := h.db.Query(c.Context(), `
		SELECT id, product_id, customer_name, rating, body, is_featured, created_at
		FROM reviews
		WHERE product_id = $1 AND status = 'approved'
		ORDER BY created_at DESC`, productID)
	if err != nil {
		return internalError(c, "ListProductReviews query", err)
	}
	defer rows.Close()

	reviews := make([]publicReview, 0)
	for rows.Next() {
		var r publicReview
		if err := rows.Scan(&r.ID, &r.ProductID, &r.CustomerName, &r.Rating, &r.Body, &r.IsFeatured, &r.CreatedAt); err != nil {
			return internalError(c, "ListProductReviews scan", err)
		}
		reviews = append(reviews, r)
	}
	return c.JSON(fiber.Map{"reviews": reviews})
}

func (h *Handler) SubmitReview(c *fiber.Ctx) error {
	productID := c.Params("productId")
	var req submitReviewRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.CustomerName = strings.TrimSpace(req.CustomerName)
	if req.CustomerName == "" {
		return badRequest(c, "customer_name is required")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return badRequest(c, "rating must be between 1 and 5")
	}

	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil {
		return internalError(c, "SubmitReview check product", err)
	}
	if !exists {
		return notFound(c, "product not found")
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO reviews (product_id, customer_name, rating, body, status)
		VALUES ($1, $2, $3, $4, 'pending')
		RETURNING id`, productID, req.CustomerName, req.Rating, req.Body,
	).Scan(&id)
	if err != nil {
		return internalError(c, "SubmitReview insert", err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":     id,
		"status": "pending",
	})
}
