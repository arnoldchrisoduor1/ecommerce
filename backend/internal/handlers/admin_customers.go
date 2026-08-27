package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminCustomerSummary struct {
	ID        string    `json:"id"`
	Email     *string   `json:"email,omitempty"`
	Phone     *string   `json:"phone,omitempty"`
	FullName  *string   `json:"full_name,omitempty"`
	IsGuest   bool      `json:"is_guest"`
	CreatedAt time.Time `json:"created_at"`
}

type adminCustomerDetail struct {
	adminCustomerSummary
	OrderCount int `json:"order_count"`
}

func (h *Handler) AdminListCustomers(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, email, phone, full_name, is_guest, created_at
		FROM customers ORDER BY created_at DESC`)
	if err != nil {
		return internalError(c, "AdminListCustomers query", err)
	}
	defer rows.Close()

	customers := make([]adminCustomerSummary, 0)
	for rows.Next() {
		var cust adminCustomerSummary
		if err := rows.Scan(&cust.ID, &cust.Email, &cust.Phone, &cust.FullName, &cust.IsGuest, &cust.CreatedAt); err != nil {
			return internalError(c, "AdminListCustomers scan", err)
		}
		customers = append(customers, cust)
	}
	return c.JSON(fiber.Map{"customers": customers})
}

func (h *Handler) AdminGetCustomer(c *fiber.Ctx) error {
	id := c.Params("id")
	var cust adminCustomerDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, email, phone, full_name, is_guest, created_at
		FROM customers WHERE id = $1`, id,
	).Scan(&cust.ID, &cust.Email, &cust.Phone, &cust.FullName, &cust.IsGuest, &cust.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "customer not found")
	}
	if err != nil {
		return internalError(c, "AdminGetCustomer query", err)
	}

	err = h.db.QueryRow(c.Context(), `SELECT COUNT(*) FROM orders WHERE customer_id = $1`, id).Scan(&cust.OrderCount)
	if err != nil {
		return internalError(c, "AdminGetCustomer order count", err)
	}
	return c.JSON(cust)
}

type adminReview struct {
	ID           string    `json:"id"`
	ProductID    string    `json:"product_id"`
	ProductName  string    `json:"product_name"`
	CustomerName string    `json:"customer_name"`
	Rating       int       `json:"rating"`
	Body         *string   `json:"body,omitempty"`
	IsFeatured   bool      `json:"is_featured"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}

type adminReviewStatusRequest struct {
	Status string `json:"status"`
}

type adminReviewFeatureRequest struct {
	IsFeatured bool `json:"is_featured"`
}

func (h *Handler) AdminListReviews(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT r.id, r.product_id, p.name, r.customer_name, r.rating, r.body,
			r.is_featured, r.status, r.created_at
		FROM reviews r
		JOIN products p ON p.id = r.product_id
		ORDER BY r.created_at DESC`)
	if err != nil {
		return internalError(c, "AdminListReviews query", err)
	}
	defer rows.Close()

	reviews := make([]adminReview, 0)
	for rows.Next() {
		var r adminReview
		if err := rows.Scan(&r.ID, &r.ProductID, &r.ProductName, &r.CustomerName, &r.Rating,
			&r.Body, &r.IsFeatured, &r.Status, &r.CreatedAt); err != nil {
			return internalError(c, "AdminListReviews scan", err)
		}
		reviews = append(reviews, r)
	}
	return c.JSON(fiber.Map{"reviews": reviews})
}

func (h *Handler) loadAdminReview(c *fiber.Ctx, id string) (*adminReview, error) {
	var r adminReview
	err := h.db.QueryRow(c.Context(), `
		SELECT r.id, r.product_id, p.name, r.customer_name, r.rating, r.body,
			r.is_featured, r.status, r.created_at
		FROM reviews r
		JOIN products p ON p.id = r.product_id
		WHERE r.id = $1`, id,
	).Scan(&r.ID, &r.ProductID, &r.ProductName, &r.CustomerName, &r.Rating,
		&r.Body, &r.IsFeatured, &r.Status, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	return &r, err
}

func (h *Handler) AdminUpdateReviewStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminReviewStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	switch req.Status {
	case "pending", "approved", "rejected":
	default:
		return badRequest(c, "invalid status")
	}

	tag, err := h.db.Exec(c.Context(), `UPDATE reviews SET status = $1 WHERE id = $2`, req.Status, id)
	if err != nil {
		return internalError(c, "AdminUpdateReviewStatus update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "review not found")
	}

	r, err := h.loadAdminReview(c, id)
	if err != nil {
		return internalError(c, "AdminUpdateReviewStatus load", err)
	}
	return c.JSON(r)
}

func (h *Handler) AdminSetReviewFeatured(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminReviewFeatureRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}

	tag, err := h.db.Exec(c.Context(), `UPDATE reviews SET is_featured = $1 WHERE id = $2`, req.IsFeatured, id)
	if err != nil {
		return internalError(c, "AdminSetReviewFeatured update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "review not found")
	}

	r, err := h.loadAdminReview(c, id)
	if err != nil {
		return internalError(c, "AdminSetReviewFeatured load", err)
	}
	return c.JSON(r)
}
