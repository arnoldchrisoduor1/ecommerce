package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type cartItemDetail struct {
	ID         string  `json:"id"`
	VariantID  string  `json:"variant_id"`
	Quantity   int     `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	LineTotal  float64 `json:"line_total"`
	SKU        string  `json:"sku"`
	Size       *string `json:"size,omitempty"`
	Color      *string `json:"color,omitempty"`
	ProductID  string  `json:"product_id"`
	ProductName string `json:"product_name"`
	ProductSlug string `json:"product_slug"`
}

type cartResponse struct {
	ID         string           `json:"id"`
	CustomerID *string          `json:"customer_id,omitempty"`
	SessionID  *string          `json:"session_id,omitempty"`
	Items      []cartItemDetail `json:"items"`
	Subtotal   float64          `json:"subtotal"`
	ItemCount  int              `json:"item_count"`
	CreatedAt  time.Time        `json:"created_at"`
	UpdatedAt  time.Time        `json:"updated_at"`
}

type createCartRequest struct {
	SessionID  *string `json:"session_id"`
	CustomerID *string `json:"customer_id"`
}

type addCartItemRequest struct {
	VariantID string `json:"variant_id"`
	Quantity  int    `json:"quantity"`
}

type updateCartItemRequest struct {
	Quantity int `json:"quantity"`
}

func (h *Handler) loadCart(c *fiber.Ctx, cartID string) (*cartResponse, error) {
	var resp cartResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT id, customer_id, session_id, created_at, updated_at
		FROM carts WHERE id = $1`, cartID,
	).Scan(&resp.ID, &resp.CustomerID, &resp.SessionID, &resp.CreatedAt, &resp.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT ci.id, ci.variant_id, ci.quantity,
			COALESCE(pv.price_override, p.sale_price, p.base_price)::float8,
			pv.sku, pv.size, pv.color, p.id, p.name, p.slug
		FROM cart_items ci
		JOIN product_variants pv ON pv.id = ci.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE ci.cart_id = $1
		ORDER BY ci.id`, cartID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	resp.Items = make([]cartItemDetail, 0)
	var subtotal float64
	var itemCount int
	for rows.Next() {
		var item cartItemDetail
		if err := rows.Scan(&item.ID, &item.VariantID, &item.Quantity, &item.UnitPrice,
			&item.SKU, &item.Size, &item.Color, &item.ProductID, &item.ProductName, &item.ProductSlug); err != nil {
			return nil, err
		}
		item.LineTotal = item.UnitPrice * float64(item.Quantity)
		subtotal += item.LineTotal
		itemCount += item.Quantity
		resp.Items = append(resp.Items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	resp.Subtotal = subtotal
	resp.ItemCount = itemCount
	return &resp, nil
}

func (h *Handler) touchCart(c *fiber.Ctx, cartID string) error {
	_, err := h.db.Exec(c.Context(), `UPDATE carts SET updated_at = now() WHERE id = $1`, cartID)
	return err
}

// CreateCart creates a guest cart (session_id) or a logged-in cart (customer_id).
func (h *Handler) CreateCart(c *fiber.Ctx) error {
	var req createCartRequest
	if err := c.BodyParser(&req); err != nil && len(c.Body()) > 0 {
		return badRequest(c, "invalid request body")
	}

	if req.CustomerID == nil && req.SessionID == nil {
		sid := uuid.NewString()
		req.SessionID = &sid
	}

	if req.CustomerID != nil {
		var exists bool
		err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM customers WHERE id = $1)`, *req.CustomerID).Scan(&exists)
		if err != nil {
			return internalError(c, "CreateCart check customer", err)
		}
		if !exists {
			return badRequest(c, "customer not found")
		}
	}

	var cartID string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO carts (customer_id, session_id)
		VALUES ($1, $2)
		RETURNING id`, req.CustomerID, req.SessionID,
	).Scan(&cartID)
	if err != nil {
		return internalError(c, "CreateCart insert", err)
	}

	cart, err := h.loadCart(c, cartID)
	if err != nil {
		return internalError(c, "CreateCart load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(cart)
}

// GetCart returns cart with line items and a computable subtotal.
func (h *Handler) GetCart(c *fiber.Ctx) error {
	cartID := c.Params("id")
	cart, err := h.loadCart(c, cartID)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "cart not found")
	}
	if err != nil {
		return internalError(c, "GetCart load", err)
	}
	return c.JSON(cart)
}

// AddCartItem adds a variant to the cart; increments quantity if already present.
func (h *Handler) AddCartItem(c *fiber.Ctx) error {
	cartID := c.Params("id")

	var req addCartItemRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.VariantID == "" {
		return badRequest(c, "variant_id is required")
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	var cartExists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM carts WHERE id = $1)`, cartID).Scan(&cartExists); err != nil {
		return internalError(c, "AddCartItem check cart", err)
	}
	if !cartExists {
		return notFound(c, "cart not found")
	}

	var variantExists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM product_variants WHERE id = $1)`, req.VariantID).Scan(&variantExists); err != nil {
		return internalError(c, "AddCartItem check variant", err)
	}
	if !variantExists {
		return badRequest(c, "variant not found")
	}

	_, err := h.db.Exec(c.Context(), `
		INSERT INTO cart_items (cart_id, variant_id, quantity)
		VALUES ($1, $2, $3)
		ON CONFLICT (cart_id, variant_id) DO UPDATE
		SET quantity = cart_items.quantity + EXCLUDED.quantity`,
		cartID, req.VariantID, req.Quantity)
	if err != nil {
		return internalError(c, "AddCartItem upsert", err)
	}

	if err := h.touchCart(c, cartID); err != nil {
		return internalError(c, "AddCartItem touch cart", err)
	}

	cart, err := h.loadCart(c, cartID)
	if err != nil {
		return internalError(c, "AddCartItem load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(cart)
}

// UpdateCartItem sets the quantity for an existing cart line item.
func (h *Handler) UpdateCartItem(c *fiber.Ctx) error {
	cartID := c.Params("id")
	itemID := c.Params("itemId")

	var req updateCartItemRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Quantity <= 0 {
		return badRequest(c, "quantity must be greater than 0")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE cart_items SET quantity = $1
		WHERE id = $2 AND cart_id = $3`, req.Quantity, itemID, cartID)
	if err != nil {
		return internalError(c, "UpdateCartItem update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "cart item not found")
	}

	if err := h.touchCart(c, cartID); err != nil {
		return internalError(c, "UpdateCartItem touch cart", err)
	}

	cart, err := h.loadCart(c, cartID)
	if err != nil {
		return internalError(c, "UpdateCartItem load", err)
	}
	return c.JSON(cart)
}

// RemoveCartItem deletes a line item from the cart.
func (h *Handler) RemoveCartItem(c *fiber.Ctx) error {
	cartID := c.Params("id")
	itemID := c.Params("itemId")

	tag, err := h.db.Exec(c.Context(), `
		DELETE FROM cart_items WHERE id = $1 AND cart_id = $2`, itemID, cartID)
	if err != nil {
		return internalError(c, "RemoveCartItem delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "cart item not found")
	}

	if err := h.touchCart(c, cartID); err != nil {
		return internalError(c, "RemoveCartItem touch cart", err)
	}

	cart, err := h.loadCart(c, cartID)
	if err != nil {
		return internalError(c, "RemoveCartItem load", err)
	}
	return c.JSON(cart)
}
