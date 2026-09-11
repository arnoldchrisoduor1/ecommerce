package handlers

import (
	"errors"
	"fmt"
	"strings"
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

type adminSavedItem struct {
	ID           string    `json:"id"`
	SavedAt      time.Time `json:"saved_at"`
	CustomerID   string    `json:"customer_id"`
	CustomerName *string   `json:"customer_name,omitempty"`
	CustomerEmail *string  `json:"customer_email,omitempty"`
	CustomerPhone *string  `json:"customer_phone,omitempty"`
	IsGuest      bool      `json:"is_guest"`
	ProductID    string    `json:"product_id"`
	ProductName  string    `json:"product_name"`
	ProductSlug  string    `json:"product_slug"`
	ProductStatus string   `json:"product_status"`
	Value        float64   `json:"value"`
	BasePrice    float64   `json:"base_price"`
	SalePrice    *float64  `json:"sale_price,omitempty"`
	ImageURL     *string   `json:"image_url,omitempty"`
	IsActive     bool      `json:"is_active"`
}

// AdminListSavedItems returns wishlist rows with customer identity,
// current product value (sale or base), and whether the product is active.
// Query: q (min 2 chars — customer name or product name), active=true|false.
func (h *Handler) AdminListSavedItems(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	activeFilter := strings.ToLower(strings.TrimSpace(c.Query("active")))

	sql := `
		SELECT w.id, w.created_at,
			c.id, c.full_name, c.email, c.phone, c.is_guest,
			p.id, p.name, p.slug, p.status, p.base_price, p.sale_price,
			COALESCE(p.sale_price, p.base_price) AS value,
			(SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1)
		FROM wishlist_items w
		JOIN customers c ON c.id = w.customer_id
		JOIN products p ON p.id = w.product_id
		WHERE 1=1`
	args := make([]any, 0, 2)

	if len([]rune(q)) >= 2 {
		args = append(args, "%"+strings.ToLower(q)+"%")
		sql += fmt.Sprintf(`
		AND (
			LOWER(COALESCE(c.full_name, '')) LIKE $%d
			OR LOWER(p.name) LIKE $%d
		)`, len(args), len(args))
	}

	switch activeFilter {
	case "true", "1", "yes":
		sql += ` AND p.status = 'active'`
	case "false", "0", "no":
		sql += ` AND p.status <> 'active'`
	}

	sql += ` ORDER BY w.created_at DESC`

	rows, err := h.db.Query(c.Context(), sql, args...)
	if err != nil {
		return internalError(c, "AdminListSavedItems query", err)
	}
	defer rows.Close()

	items := make([]adminSavedItem, 0)
	for rows.Next() {
		var item adminSavedItem
		if err := rows.Scan(
			&item.ID, &item.SavedAt,
			&item.CustomerID, &item.CustomerName, &item.CustomerEmail, &item.CustomerPhone, &item.IsGuest,
			&item.ProductID, &item.ProductName, &item.ProductSlug, &item.ProductStatus,
			&item.BasePrice, &item.SalePrice, &item.Value, &item.ImageURL,
		); err != nil {
			return internalError(c, "AdminListSavedItems scan", err)
		}
		item.IsActive = item.ProductStatus == "active"
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"items": items, "count": len(items)})
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

	tag, err := h.db.Exec(c.Context(), `
		UPDATE reviews SET is_featured = $1,
			status = CASE WHEN $1 = true THEN 'approved' ELSE status END
		WHERE id = $2`, req.IsFeatured, id)
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
