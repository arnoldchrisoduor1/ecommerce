package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
)

const sessionCustomerTTL = 30 * 24 * time.Hour

func sessionCustomerKey(sessionID string) string {
	return "customer:session:" + sessionID
}

// ensureGuestCustomer maps a browser session_id to a guest customers row via Redis.
func (h *Handler) ensureGuestCustomer(ctx context.Context, sessionID string) (string, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return "", errors.New("session_id is required")
	}
	key := sessionCustomerKey(sessionID)
	if id, err := h.rdb.Get(ctx, key).Result(); err == nil && id != "" {
		return id, nil
	} else if err != nil && err != redis.Nil {
		return "", err
	}

	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO customers (is_guest) VALUES (true) RETURNING id`).Scan(&id)
	if err != nil {
		return "", err
	}
	if err := h.rdb.Set(ctx, key, id, sessionCustomerTTL).Err(); err != nil {
		return "", err
	}
	return id, nil
}

func normalizePhone(p string) string {
	return strings.TrimSpace(p)
}

type accountOrderSummary struct {
	ID             string    `json:"id"`
	Status         string    `json:"status"`
	Subtotal       float64   `json:"subtotal"`
	DeliveryFee    float64   `json:"delivery_fee"`
	DiscountAmount float64   `json:"discount_amount"`
	Total          float64   `json:"total"`
	PaymentMethod  *string   `json:"payment_method,omitempty"`
	PaymentStatus  string    `json:"payment_status"`
	DiscountCode   *string   `json:"discount_code,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type accountOrderItem struct {
	ID          string  `json:"id"`
	VariantID   string  `json:"variant_id"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	SKU         string  `json:"sku"`
	ProductName string  `json:"product_name"`
}

type accountOrderDetail struct {
	accountOrderSummary
	CustomerID      *string            `json:"customer_id,omitempty"`
	ShippingAddress json.RawMessage    `json:"shipping_address"`
	Items           []accountOrderItem `json:"items"`
}

// ListMyOrders returns orders for a guest identity.
// Query: session_id | customer_id | phone | email
// Phone/email also match guest checkout rows via shipping_address JSON.
func (h *Handler) ListMyOrders(c *fiber.Ctx) error {
	phone := normalizePhone(c.Query("phone"))
	email := strings.TrimSpace(strings.ToLower(c.Query("email")))
	customerID := strings.TrimSpace(c.Query("customer_id"))
	sessionID := strings.TrimSpace(c.Query("session_id"))

	if customerID == "" && sessionID != "" {
		id, err := h.ensureGuestCustomer(c.Context(), sessionID)
		if err != nil {
			return internalError(c, "ListMyOrders ensure customer", err)
		}
		customerID = id
	}
	if customerID == "" && phone == "" && email == "" {
		return badRequest(c, "phone, email, session_id, or customer_id is required")
	}

	var custArg any
	if customerID != "" {
		custArg = customerID
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, discount_code, created_at
		FROM orders
		WHERE ($1::uuid IS NOT NULL AND customer_id = $1::uuid)
		   OR ($2 <> '' AND shipping_address->>'phone' = $2)
		   OR ($3 <> '' AND lower(coalesce(shipping_address->>'email','')) = $3)
		ORDER BY created_at DESC`,
		custArg, phone, email,
	)
	if err != nil {
		return internalError(c, "ListMyOrders query", err)
	}
	defer rows.Close()

	orders := make([]accountOrderSummary, 0)
	for rows.Next() {
		var o accountOrderSummary
		if err := rows.Scan(&o.ID, &o.Status, &o.Subtotal, &o.DeliveryFee, &o.DiscountAmount,
			&o.Total, &o.PaymentMethod, &o.PaymentStatus, &o.DiscountCode, &o.CreatedAt); err != nil {
			return internalError(c, "ListMyOrders scan", err)
		}
		orders = append(orders, o)
	}
	out := fiber.Map{"orders": orders}
	if customerID != "" {
		out["customer_id"] = customerID
	}
	return c.JSON(out)
}

// GetMyOrder returns one order if the caller can prove ownership.
func (h *Handler) GetMyOrder(c *fiber.Ctx) error {
	id := c.Params("id")
	phone := normalizePhone(c.Query("phone"))
	email := strings.TrimSpace(strings.ToLower(c.Query("email")))
	customerID := strings.TrimSpace(c.Query("customer_id"))
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if customerID == "" && sessionID != "" {
		cid, err := h.ensureGuestCustomer(c.Context(), sessionID)
		if err != nil {
			return internalError(c, "GetMyOrder ensure customer", err)
		}
		customerID = cid
	}
	if phone == "" && email == "" && customerID == "" {
		return badRequest(c, "phone, email, session_id, or customer_id is required")
	}

	detail, err := h.loadAccountOrder(c.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c, "order not found")
		}
		return internalError(c, "GetMyOrder load", err)
	}
	if !orderMatchesIdentity(detail, customerID, phone, email) {
		return notFound(c, "order not found")
	}
	return c.JSON(detail)
}

func (h *Handler) loadAccountOrder(ctx context.Context, id string) (*accountOrderDetail, error) {
	var detail accountOrderDetail
	err := h.db.QueryRow(ctx, `
		SELECT id, customer_id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, discount_code, created_at, shipping_address
		FROM orders WHERE id = $1`, id,
	).Scan(&detail.ID, &detail.CustomerID, &detail.Status, &detail.Subtotal, &detail.DeliveryFee,
		&detail.DiscountAmount, &detail.Total, &detail.PaymentMethod, &detail.PaymentStatus,
		&detail.DiscountCode, &detail.CreatedAt, &detail.ShippingAddress)
	if err != nil {
		return nil, err
	}

	rows, err := h.db.Query(ctx, `
		SELECT oi.id, oi.variant_id, oi.quantity, oi.unit_price, pv.sku, p.name
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	detail.Items = make([]accountOrderItem, 0)
	for rows.Next() {
		var item accountOrderItem
		if err := rows.Scan(&item.ID, &item.VariantID, &item.Quantity, &item.UnitPrice, &item.SKU, &item.ProductName); err != nil {
			return nil, err
		}
		detail.Items = append(detail.Items, item)
	}
	return &detail, nil
}

func orderMatchesIdentity(detail *accountOrderDetail, customerID, phone, email string) bool {
	if customerID != "" && detail.CustomerID != nil && *detail.CustomerID == customerID {
		return true
	}
	var addr map[string]any
	_ = json.Unmarshal(detail.ShippingAddress, &addr)
	addrPhone, _ := addr["phone"].(string)
	addrEmail, _ := addr["email"].(string)
	if phone != "" && normalizePhone(addrPhone) == phone {
		return true
	}
	if email != "" && strings.EqualFold(strings.TrimSpace(addrEmail), email) {
		return true
	}
	return false
}

// TrackOrder — standalone, no login. Query: order_id + phone|email
func (h *Handler) TrackOrder(c *fiber.Ctx) error {
	orderID := strings.TrimSpace(c.Query("order_id"))
	phone := normalizePhone(c.Query("phone"))
	email := strings.TrimSpace(strings.ToLower(c.Query("email")))
	if orderID == "" {
		return badRequest(c, "order_id is required")
	}
	if phone == "" && email == "" {
		return badRequest(c, "phone or email is required")
	}

	detail, err := h.loadAccountOrder(c.Context(), orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c, "order not found")
		}
		return internalError(c, "TrackOrder load", err)
	}
	if !orderMatchesIdentity(detail, "", phone, email) {
		return notFound(c, "order not found")
	}
	return c.JSON(detail)
}

type wishlistProduct struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Slug      string   `json:"slug"`
	BasePrice float64  `json:"base_price"`
	SalePrice *float64 `json:"sale_price,omitempty"`
	ImageURL  *string  `json:"image_url,omitempty"`
}

func (h *Handler) resolveAccountCustomer(c *fiber.Ctx) (string, error) {
	if id := strings.TrimSpace(c.Query("customer_id")); id != "" {
		return id, nil
	}
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if sessionID == "" {
		var body struct {
			SessionID string `json:"session_id"`
		}
		_ = c.BodyParser(&body)
		sessionID = strings.TrimSpace(body.SessionID)
	}
	if sessionID == "" {
		return "", errors.New("session_id or customer_id is required")
	}
	return h.ensureGuestCustomer(c.Context(), sessionID)
}

func (h *Handler) GetWishlist(c *fiber.Ctx) error {
	customerID, err := h.resolveAccountCustomer(c)
	if err != nil {
		return badRequest(c, err.Error())
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.slug, p.base_price, p.sale_price,
			(SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position LIMIT 1)
		FROM wishlist_items w
		JOIN products p ON p.id = w.product_id
		WHERE w.customer_id = $1
		ORDER BY w.created_at DESC`, customerID)
	if err != nil {
		return internalError(c, "GetWishlist query", err)
	}
	defer rows.Close()

	items := make([]wishlistProduct, 0)
	for rows.Next() {
		var p wishlistProduct
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.BasePrice, &p.SalePrice, &p.ImageURL); err != nil {
			return internalError(c, "GetWishlist scan", err)
		}
		items = append(items, p)
	}
	return c.JSON(fiber.Map{"items": items, "customer_id": customerID})
}

func (h *Handler) AddToWishlist(c *fiber.Ctx) error {
	customerID, err := h.resolveAccountCustomer(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	productID := c.Params("productId")
	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil {
		return internalError(c, "AddToWishlist product check", err)
	}
	if !exists {
		return notFound(c, "product not found")
	}
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO wishlist_items (customer_id, product_id)
		VALUES ($1, $2) ON CONFLICT (customer_id, product_id) DO NOTHING`, customerID, productID)
	if err != nil {
		return internalError(c, "AddToWishlist insert", err)
	}
	return c.JSON(fiber.Map{"ok": true, "customer_id": customerID})
}

func (h *Handler) RemoveFromWishlist(c *fiber.Ctx) error {
	customerID, err := h.resolveAccountCustomer(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	productID := c.Params("productId")
	tag, err := h.db.Exec(c.Context(), `
		DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2`, customerID, productID)
	if err != nil {
		return internalError(c, "RemoveFromWishlist delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "wishlist item not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type addressResponse struct {
	ID         string    `json:"id"`
	CustomerID string    `json:"customer_id"`
	Label      *string   `json:"label,omitempty"`
	Line1      string    `json:"line1"`
	Line2      *string   `json:"line2,omitempty"`
	City       string    `json:"city"`
	County     *string   `json:"county,omitempty"`
	Phone      string    `json:"phone"`
	IsDefault  bool      `json:"is_default"`
	CreatedAt  time.Time `json:"created_at"`
}

type createAddressRequest struct {
	SessionID string  `json:"session_id"`
	Label     *string `json:"label"`
	Line1     string  `json:"line1"`
	Line2     *string `json:"line2"`
	City      string  `json:"city"`
	County    *string `json:"county"`
	Phone     string  `json:"phone"`
	IsDefault bool    `json:"is_default"`
}

func (h *Handler) ListAddresses(c *fiber.Ctx) error {
	customerID, err := h.resolveAccountCustomer(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	rows, err := h.db.Query(c.Context(), `
		SELECT id, customer_id, label, line1, line2, city, county, phone, is_default, created_at
		FROM addresses WHERE customer_id = $1
		ORDER BY is_default DESC, created_at DESC`, customerID)
	if err != nil {
		return internalError(c, "ListAddresses query", err)
	}
	defer rows.Close()

	addrs := make([]addressResponse, 0)
	for rows.Next() {
		var a addressResponse
		if err := rows.Scan(&a.ID, &a.CustomerID, &a.Label, &a.Line1, &a.Line2, &a.City,
			&a.County, &a.Phone, &a.IsDefault, &a.CreatedAt); err != nil {
			return internalError(c, "ListAddresses scan", err)
		}
		addrs = append(addrs, a)
	}
	return c.JSON(fiber.Map{"addresses": addrs, "customer_id": customerID})
}

func (h *Handler) CreateAddress(c *fiber.Ctx) error {
	var req createAddressRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Line1 == "" || req.City == "" || req.Phone == "" {
		return badRequest(c, "line1, city, and phone are required")
	}

	customerID := strings.TrimSpace(c.Query("customer_id"))
	if customerID == "" {
		sessionID := strings.TrimSpace(c.Query("session_id"))
		if sessionID == "" {
			sessionID = strings.TrimSpace(req.SessionID)
		}
		if sessionID == "" {
			return badRequest(c, "session_id or customer_id is required")
		}
		var err error
		customerID, err = h.ensureGuestCustomer(c.Context(), sessionID)
		if err != nil {
			return internalError(c, "CreateAddress ensure customer", err)
		}
	}

	if req.IsDefault {
		_, _ = h.db.Exec(c.Context(), `UPDATE addresses SET is_default = false WHERE customer_id = $1`, customerID)
	}

	var a addressResponse
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO addresses (customer_id, label, line1, line2, city, county, phone, is_default)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, customer_id, label, line1, line2, city, county, phone, is_default, created_at`,
		customerID, req.Label, req.Line1, req.Line2, req.City, req.County, req.Phone, req.IsDefault,
	).Scan(&a.ID, &a.CustomerID, &a.Label, &a.Line1, &a.Line2, &a.City, &a.County, &a.Phone, &a.IsDefault, &a.CreatedAt)
	if err != nil {
		return internalError(c, "CreateAddress insert", err)
	}
	return c.Status(fiber.StatusCreated).JSON(a)
}
