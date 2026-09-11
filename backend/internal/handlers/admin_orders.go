package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type adminOrderSummary struct {
	ID                       string    `json:"id"`
	CustomerID               *string   `json:"customer_id,omitempty"`
	Status                   string    `json:"status"`
	Subtotal                 float64   `json:"subtotal"`
	DeliveryFee              float64   `json:"delivery_fee"`
	DiscountAmount           float64   `json:"discount_amount"`
	Total                    float64   `json:"total"`
	PaymentMethod            *string   `json:"payment_method,omitempty"`
	PaymentStatus            string    `json:"payment_status"`
	DiscountCode             *string   `json:"discount_code,omitempty"`
	EstimatedDeliveryMinDays int       `json:"estimated_delivery_min_days"`
	EstimatedDeliveryMaxDays int       `json:"estimated_delivery_max_days"`
	EstimatedDeliveryLabel   string    `json:"estimated_delivery_label"`
	CreatedAt                time.Time `json:"created_at"`
}

type adminOrderItem struct {
	ID          string  `json:"id"`
	VariantID   string  `json:"variant_id"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	LineTotal   float64 `json:"line_total"`
	SKU         string  `json:"sku"`
	ProductName string  `json:"product_name"`
	ImageURL    *string `json:"image_url,omitempty"`
	Size        *string `json:"size,omitempty"`
	Color       *string `json:"color,omitempty"`
}

type adminOrderCard struct {
	adminOrderSummary
	ShippingAddress json.RawMessage  `json:"shipping_address"`
	Items           []adminOrderItem `json:"items"`
}

type adminUpdateOrderStatusRequest struct {
	Status string `json:"status"`
}

type adminUpdateOrderDeliveryRequest struct {
	MinDays int `json:"estimated_delivery_min_days"`
	MaxDays int `json:"estimated_delivery_max_days"`
}

var allowedOrderStatuses = map[string]bool{
	"pending": true, "paid": true, "fulfilled": true, "cancelled": true, "refunded": true,
}

const adminOrderSelectCols = `
	id, customer_id, status, subtotal, delivery_fee, discount_amount, total,
	payment_method, payment_status, discount_code,
	estimated_delivery_min_days, estimated_delivery_max_days, created_at, shipping_address`

func scanAdminOrderCard(scan func(dest ...any) error) (adminOrderCard, error) {
	var o adminOrderCard
	err := scan(
		&o.ID, &o.CustomerID, &o.Status, &o.Subtotal, &o.DeliveryFee,
		&o.DiscountAmount, &o.Total, &o.PaymentMethod, &o.PaymentStatus, &o.DiscountCode,
		&o.EstimatedDeliveryMinDays, &o.EstimatedDeliveryMaxDays, &o.CreatedAt, &o.ShippingAddress,
	)
	if err != nil {
		return o, err
	}
	o.EstimatedDeliveryLabel = formatDeliveryEstimateLabel(o.EstimatedDeliveryMinDays, o.EstimatedDeliveryMaxDays)
	o.Items = make([]adminOrderItem, 0)
	return o, nil
}

func loadAdminOrderItems(ctx context.Context, db *pgxpool.Pool, orderIDs []string) (map[string][]adminOrderItem, error) {
	out := make(map[string][]adminOrderItem, len(orderIDs))
	if len(orderIDs) == 0 {
		return out, nil
	}
	rows, err := db.Query(ctx, `
		SELECT oi.order_id, oi.id, oi.variant_id, oi.quantity, oi.unit_price, pv.sku, p.name,
			pv.size, pv.color,
			(SELECT url FROM product_images pi
			 WHERE pi.product_id = p.id
			 ORDER BY CASE WHEN pi.variant_id = oi.variant_id THEN 0 ELSE 1 END, pi.position
			 LIMIT 1)
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id = ANY($1)
		ORDER BY oi.id ASC`, orderIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID string
		var item adminOrderItem
		if err := rows.Scan(
			&orderID, &item.ID, &item.VariantID, &item.Quantity, &item.UnitPrice,
			&item.SKU, &item.ProductName, &item.Size, &item.Color, &item.ImageURL,
		); err != nil {
			return nil, err
		}
		item.LineTotal = item.UnitPrice * float64(item.Quantity)
		out[orderID] = append(out[orderID], item)
	}
	return out, rows.Err()
}

func attachOrderItems(orders []adminOrderCard, itemsByOrder map[string][]adminOrderItem) {
	for i := range orders {
		if items, ok := itemsByOrder[orders[i].ID]; ok {
			orders[i].Items = items
		} else {
			orders[i].Items = make([]adminOrderItem, 0)
		}
	}
}

func (h *Handler) listAdminOrderCards(ctx context.Context, limit int) ([]adminOrderCard, error) {
	q := `
		SELECT ` + adminOrderSelectCols + `
		FROM orders
		ORDER BY created_at DESC`
	args := []any{}
	if limit > 0 {
		q += ` LIMIT $1`
		args = append(args, limit)
	}
	rows, err := h.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := make([]adminOrderCard, 0)
	ids := make([]string, 0)
	for rows.Next() {
		o, err := scanAdminOrderCard(rows.Scan)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
		ids = append(ids, o.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	itemsByOrder, err := loadAdminOrderItems(ctx, h.db, ids)
	if err != nil {
		return nil, err
	}
	attachOrderItems(orders, itemsByOrder)
	return orders, nil
}

func (h *Handler) loadAdminOrderCard(ctx context.Context, id string) (adminOrderCard, error) {
	o, err := scanAdminOrderCard(func(dest ...any) error {
		return h.db.QueryRow(ctx, `
			SELECT `+adminOrderSelectCols+`
			FROM orders WHERE id = $1`, id).Scan(dest...)
	})
	if err != nil {
		return o, err
	}
	itemsByOrder, err := loadAdminOrderItems(ctx, h.db, []string{id})
	if err != nil {
		return o, err
	}
	if items, ok := itemsByOrder[id]; ok {
		o.Items = items
	}
	return o, nil
}

func (h *Handler) AdminListOrders(c *fiber.Ctx) error {
	orders, err := h.listAdminOrderCards(c.Context(), 0)
	if err != nil {
		return internalError(c, "AdminListOrders", err)
	}
	return c.JSON(fiber.Map{"orders": orders})
}

func (h *Handler) AdminGetOrder(c *fiber.Ctx) error {
	id := c.Params("id")
	o, err := h.loadAdminOrderCard(c.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "order not found")
	}
	if err != nil {
		return internalError(c, "AdminGetOrder", err)
	}
	return c.JSON(o)
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

	o, err := h.loadAdminOrderCard(c.Context(), id)
	if err != nil {
		return internalError(c, "AdminUpdateOrderStatus load", err)
	}
	return c.JSON(o)
}

func (h *Handler) AdminUpdateOrderDeliveryEstimate(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminUpdateOrderDeliveryRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	minDays, maxDays := normalizeDeliveryEstimate(req.MinDays, req.MaxDays)

	tag, err := h.db.Exec(c.Context(), `
		UPDATE orders
		SET estimated_delivery_min_days = $1,
		    estimated_delivery_max_days = $2,
		    updated_at = now()
		WHERE id = $3`, minDays, maxDays, id)
	if err != nil {
		return internalError(c, "AdminUpdateOrderDeliveryEstimate update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "order not found")
	}

	o, err := h.loadAdminOrderCard(c.Context(), id)
	if err != nil {
		return internalError(c, "AdminUpdateOrderDeliveryEstimate load", err)
	}
	return c.JSON(o)
}
