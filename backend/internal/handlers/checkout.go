package handlers

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type shippingAddress struct {
	Line1  string  `json:"line1"`
	Line2  *string `json:"line2,omitempty"`
	City   string  `json:"city"`
	County *string `json:"county,omitempty"`
	Phone  string  `json:"phone"`
	Label  *string `json:"label,omitempty"`
}

type deliveryQuoteRequest struct {
	CartID          string          `json:"cart_id"`
	ShippingAddress shippingAddress `json:"shipping_address"`
}

type deliveryQuoteResponse struct {
	DeliveryFee   float64 `json:"delivery_fee"`
	EstimatedDays int     `json:"estimated_days"`
	Courier       string  `json:"courier"`
}

type createOrderRequest struct {
	CartID          string          `json:"cart_id"`
	ShippingAddress shippingAddress `json:"shipping_address"`
	PaymentMethod   string          `json:"payment_method"`
	DiscountCode    *string         `json:"discount_code,omitempty"`
	DeliveryFee     *float64        `json:"delivery_fee,omitempty"`
}

type orderResponse struct {
	ID             string          `json:"id"`
	Status         string          `json:"status"`
	Subtotal       float64         `json:"subtotal"`
	DeliveryFee    float64         `json:"delivery_fee"`
	DiscountAmount float64         `json:"discount_amount"`
	Total          float64         `json:"total"`
	PaymentMethod  *string         `json:"payment_method,omitempty"`
	PaymentStatus  string          `json:"payment_status"`
	ShippingAddress json.RawMessage `json:"shipping_address"`
	DiscountCode   *string         `json:"discount_code,omitempty"`
}

func validateShippingAddress(addr shippingAddress) error {
	if addr.Line1 == "" || addr.City == "" || addr.Phone == "" {
		return errors.New("shipping_address requires line1, city, and phone")
	}
	return nil
}

const stubDeliveryFee = 250.00

// DeliveryQuote returns a fixed test delivery quote (courier integration later).
func (h *Handler) DeliveryQuote(c *fiber.Ctx) error {
	var req deliveryQuoteRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.CartID == "" {
		return badRequest(c, "cart_id is required")
	}
	if err := validateShippingAddress(req.ShippingAddress); err != nil {
		return badRequest(c, err.Error())
	}

	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM carts WHERE id = $1)`, req.CartID).Scan(&exists); err != nil {
		return internalError(c, "DeliveryQuote check cart", err)
	}
	if !exists {
		return notFound(c, "cart not found")
	}

	return c.JSON(deliveryQuoteResponse{
		DeliveryFee:   stubDeliveryFee,
		EstimatedDays: 2,
		Courier:       "Test Courier",
	})
}

func computeDiscountAmount(d *discountResponse, subtotal float64) float64 {
	if subtotal <= 0 {
		return 0
	}
	switch d.Type {
	case "percentage":
		amount := subtotal * d.Value / 100
		if amount > subtotal {
			return subtotal
		}
		return amount
	case "fixed":
		if d.Value > subtotal {
			return subtotal
		}
		return d.Value
	default:
		return 0
	}
}

// CreateOrder validates the cart, snapshots address/pricing, writes order rows,
// and decrements variant stock in one transaction.
func (h *Handler) CreateOrder(c *fiber.Ctx) error {
	var req createOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.CartID == "" {
		return badRequest(c, "cart_id is required")
	}
	if req.PaymentMethod == "" {
		return badRequest(c, "payment_method is required")
	}
	if err := validateShippingAddress(req.ShippingAddress); err != nil {
		return badRequest(c, err.Error())
	}

	deliveryFee := stubDeliveryFee
	if req.DeliveryFee != nil {
		if *req.DeliveryFee < 0 {
			return badRequest(c, "delivery_fee must be >= 0")
		}
		deliveryFee = *req.DeliveryFee
	}

	addrJSON, err := json.Marshal(req.ShippingAddress)
	if err != nil {
		return internalError(c, "CreateOrder marshal address", err)
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "CreateOrder begin tx", err)
	}
	defer tx.Rollback(c.Context())

	var customerID *string
	err = tx.QueryRow(c.Context(), `SELECT customer_id FROM carts WHERE id = $1`, req.CartID).Scan(&customerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "cart not found")
	}
	if err != nil {
		return internalError(c, "CreateOrder load cart", err)
	}

	rows, err := tx.Query(c.Context(), `
		SELECT ci.variant_id, ci.quantity,
			COALESCE(pv.price_override, p.sale_price, p.base_price)::float8,
			pv.stock_qty
		FROM cart_items ci
		JOIN product_variants pv ON pv.id = ci.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE ci.cart_id = $1
		FOR UPDATE OF pv`, req.CartID)
	if err != nil {
		return internalError(c, "CreateOrder load items", err)
	}

	type orderLine struct {
		VariantID string
		Quantity  int
		UnitPrice float64
		StockQty  int
	}
	lines := make([]orderLine, 0)
	var subtotal float64
	for rows.Next() {
		var line orderLine
		if err := rows.Scan(&line.VariantID, &line.Quantity, &line.UnitPrice, &line.StockQty); err != nil {
			rows.Close()
			return internalError(c, "CreateOrder scan item", err)
		}
		if line.Quantity <= 0 {
			rows.Close()
			return badRequest(c, "cart contains invalid quantity")
		}
		if line.StockQty < line.Quantity {
			rows.Close()
			return badRequest(c, "insufficient stock for one or more items")
		}
		subtotal += line.UnitPrice * float64(line.Quantity)
		lines = append(lines, line)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return internalError(c, "CreateOrder item rows", err)
	}
	rows.Close()

	if len(lines) == 0 {
		return badRequest(c, "cart is empty")
	}

	var discountAmount float64
	var discountCode *string
	if req.DiscountCode != nil && *req.DiscountCode != "" {
		var d discountResponse
		err := tx.QueryRow(c.Context(), `
			SELECT id, code, type, value, max_claims, active_from, active_to, is_active, context
			FROM discounts WHERE code = $1`, *req.DiscountCode,
		).Scan(&d.ID, &d.Code, &d.Type, &d.Value, &d.MaxClaims, &d.ActiveFrom, &d.ActiveTo, &d.IsActive, &d.Context)
		if errors.Is(err, pgx.ErrNoRows) {
			return badRequest(c, "discount code not found")
		}
		if err != nil {
			return internalError(c, "CreateOrder load discount", err)
		}
		if ok, msg := discountIsClaimable(&d, timeNow()); !ok {
			return badRequest(c, msg)
		}
		discountAmount = computeDiscountAmount(&d, subtotal)
		discountCode = &d.Code
	}

	total := subtotal + deliveryFee - discountAmount
	if total < 0 {
		total = 0
	}

	var orderID string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO orders (
			customer_id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, shipping_address, discount_code
		) VALUES ($1, 'pending', $2, $3, $4, $5, $6, 'unpaid', $7, $8)
		RETURNING id`,
		customerID, subtotal, deliveryFee, discountAmount, total,
		req.PaymentMethod, addrJSON, discountCode,
	).Scan(&orderID)
	if err != nil {
		return internalError(c, "CreateOrder insert order", err)
	}

	for _, line := range lines {
		_, err := tx.Exec(c.Context(), `
			INSERT INTO order_items (order_id, variant_id, quantity, unit_price)
			VALUES ($1, $2, $3, $4)`,
			orderID, line.VariantID, line.Quantity, line.UnitPrice)
		if err != nil {
			return internalError(c, "CreateOrder insert order item", err)
		}

		tag, err := tx.Exec(c.Context(), `
			UPDATE product_variants
			SET stock_qty = stock_qty - $1
			WHERE id = $2 AND stock_qty >= $1`,
			line.Quantity, line.VariantID)
		if err != nil {
			return internalError(c, "CreateOrder decrement stock", err)
		}
		if tag.RowsAffected() == 0 {
			return badRequest(c, "insufficient stock for one or more items")
		}
	}

	_, err = tx.Exec(c.Context(), `DELETE FROM cart_items WHERE cart_id = $1`, req.CartID)
	if err != nil {
		return internalError(c, "CreateOrder clear cart", err)
	}

	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "CreateOrder commit", err)
	}

	return c.Status(fiber.StatusCreated).JSON(orderResponse{
		ID:              orderID,
		Status:          "pending",
		Subtotal:        subtotal,
		DeliveryFee:     deliveryFee,
		DiscountAmount:  discountAmount,
		Total:           total,
		PaymentMethod:   &req.PaymentMethod,
		PaymentStatus:   "unpaid",
		ShippingAddress: addrJSON,
		DiscountCode:    discountCode,
	})
}

// timeNow is a seam for tests; production uses real time.
var timeNow = func() time.Time { return time.Now() }
