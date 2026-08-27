package handlers

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminOrderSummary struct {
	ID            string    `json:"id"`
	CustomerID    *string   `json:"customer_id,omitempty"`
	Status        string    `json:"status"`
	Subtotal      float64   `json:"subtotal"`
	DeliveryFee   float64   `json:"delivery_fee"`
	DiscountAmount float64  `json:"discount_amount"`
	Total         float64   `json:"total"`
	PaymentMethod *string   `json:"payment_method,omitempty"`
	PaymentStatus string    `json:"payment_status"`
	DiscountCode  *string   `json:"discount_code,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type adminOrderItem struct {
	ID        string  `json:"id"`
	VariantID string  `json:"variant_id"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	SKU       string  `json:"sku"`
	ProductName string `json:"product_name"`
}

type adminOrderDetail struct {
	adminOrderSummary
	ShippingAddress json.RawMessage `json:"shipping_address"`
	Items           []adminOrderItem `json:"items"`
}

type adminUpdateOrderStatusRequest struct {
	Status string `json:"status"`
}

var allowedOrderStatuses = map[string]bool{
	"pending": true, "paid": true, "fulfilled": true, "cancelled": true, "refunded": true,
}

func (h *Handler) AdminListOrders(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, customer_id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, discount_code, created_at
		FROM orders ORDER BY created_at DESC`)
	if err != nil {
		return internalError(c, "AdminListOrders query", err)
	}
	defer rows.Close()

	orders := make([]adminOrderSummary, 0)
	for rows.Next() {
		var o adminOrderSummary
		if err := rows.Scan(&o.ID, &o.CustomerID, &o.Status, &o.Subtotal, &o.DeliveryFee,
			&o.DiscountAmount, &o.Total, &o.PaymentMethod, &o.PaymentStatus, &o.DiscountCode, &o.CreatedAt); err != nil {
			return internalError(c, "AdminListOrders scan", err)
		}
		orders = append(orders, o)
	}
	return c.JSON(fiber.Map{"orders": orders})
}

func (h *Handler) AdminGetOrder(c *fiber.Ctx) error {
	id := c.Params("id")
	var detail adminOrderDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, customer_id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, discount_code, created_at, shipping_address
		FROM orders WHERE id = $1`, id,
	).Scan(&detail.ID, &detail.CustomerID, &detail.Status, &detail.Subtotal, &detail.DeliveryFee,
		&detail.DiscountAmount, &detail.Total, &detail.PaymentMethod, &detail.PaymentStatus,
		&detail.DiscountCode, &detail.CreatedAt, &detail.ShippingAddress)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "order not found")
	}
	if err != nil {
		return internalError(c, "AdminGetOrder query", err)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT oi.id, oi.variant_id, oi.quantity, oi.unit_price, pv.sku, p.name
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id = $1`, id)
	if err != nil {
		return internalError(c, "AdminGetOrder items", err)
	}
	defer rows.Close()

	detail.Items = make([]adminOrderItem, 0)
	for rows.Next() {
		var item adminOrderItem
		if err := rows.Scan(&item.ID, &item.VariantID, &item.Quantity, &item.UnitPrice, &item.SKU, &item.ProductName); err != nil {
			return internalError(c, "AdminGetOrder scan item", err)
		}
		detail.Items = append(detail.Items, item)
	}
	return c.JSON(detail)
}

func (h *Handler) AdminUpdateOrderStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminUpdateOrderStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if !allowedOrderStatuses[req.Status] {
		return badRequest(c, "invalid status")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`, req.Status, id)
	if err != nil {
		return internalError(c, "AdminUpdateOrderStatus update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "order not found")
	}

	var o adminOrderSummary
	err = h.db.QueryRow(c.Context(), `
		SELECT id, customer_id, status, subtotal, delivery_fee, discount_amount, total,
			payment_method, payment_status, discount_code, created_at
		FROM orders WHERE id = $1`, id,
	).Scan(&o.ID, &o.CustomerID, &o.Status, &o.Subtotal, &o.DeliveryFee,
		&o.DiscountAmount, &o.Total, &o.PaymentMethod, &o.PaymentStatus, &o.DiscountCode, &o.CreatedAt)
	if err != nil {
		return internalError(c, "AdminUpdateOrderStatus load", err)
	}
	return c.JSON(o)
}
