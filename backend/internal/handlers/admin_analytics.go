package handlers

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

type adminOverviewResponse struct {
	OrdersToday         int              `json:"orders_today"`
	RevenueToday        float64          `json:"revenue_today"`
	ActiveViewers       int64            `json:"active_viewers"`
	DiscountClaimsToday int              `json:"discount_claims_today"`
	RecentOrders        []adminOrderCard `json:"recent_orders"`
}

type lowStockVariant struct {
	VariantID   string  `json:"variant_id"`
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	SKU         string  `json:"sku"`
	Size        *string `json:"size,omitempty"`
	Color       *string `json:"color,omitempty"`
	StockQty    int     `json:"stock_qty"`
	Threshold   int     `json:"low_stock_threshold"`
}

// AdminOverview returns dashboard stat cards data.
func (h *Handler) AdminOverview(c *fiber.Ctx) error {
	ctx := c.Context()

	var ordersToday int
	var revenueToday float64
	err := h.db.QueryRow(ctx, `
		SELECT COUNT(*)::int, COALESCE(SUM(total), 0)
		FROM orders
		WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`).Scan(&ordersToday, &revenueToday)
	if err != nil {
		return internalError(c, "AdminOverview orders", err)
	}

	var claimsToday int
	err = h.db.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM discount_claims
		WHERE claimed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`).Scan(&claimsToday)
	if err != nil {
		return internalError(c, "AdminOverview claims", err)
	}

	viewers, err := h.countActiveViewers(ctx)
	if err != nil {
		return internalError(c, "AdminOverview viewers", err)
	}

	recent, err := h.listAdminOrderCards(ctx, 8)
	if err != nil {
		return internalError(c, "AdminOverview recent orders", err)
	}

	return c.JSON(adminOverviewResponse{
		OrdersToday:         ordersToday,
		RevenueToday:        revenueToday,
		ActiveViewers:       viewers,
		DiscountClaimsToday: claimsToday,
		RecentOrders:        recent,
	})
}

func (h *Handler) countActiveViewers(ctx context.Context) (int64, error) {
	var total int64
	cutoff := float64(time.Now().Add(-presenceTTL()).UnixMilli())
	cutoffStr := strconv.FormatFloat(cutoff, 'f', 0, 64)

	iter := h.rdb.Scan(ctx, 0, "presence:product:*", 100).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		if err := h.rdb.ZRemRangeByScore(ctx, key, "-inf", cutoffStr).Err(); err != nil {
			return 0, err
		}
		n, err := h.rdb.ZCard(ctx, key).Result()
		if err != nil {
			return 0, err
		}
		total += n
	}
	if err := iter.Err(); err != nil {
		return 0, err
	}
	return total, nil
}

// AdminLowStockAlerts lists variants at or below their low-stock threshold.
func (h *Handler) AdminLowStockAlerts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT pv.id, p.id, p.name, pv.sku, pv.size, pv.color, pv.stock_qty, pv.low_stock_threshold
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id
		WHERE p.status = 'active' AND pv.stock_qty <= pv.low_stock_threshold
		ORDER BY pv.stock_qty ASC, p.name
		LIMIT 50`)
	if err != nil {
		return internalError(c, "AdminLowStockAlerts query", err)
	}
	defer rows.Close()

	items := make([]lowStockVariant, 0)
	for rows.Next() {
		var v lowStockVariant
		if err := rows.Scan(&v.VariantID, &v.ProductID, &v.ProductName, &v.SKU,
			&v.Size, &v.Color, &v.StockQty, &v.Threshold); err != nil {
			return internalError(c, "AdminLowStockAlerts scan", err)
		}
		items = append(items, v)
	}
	return c.JSON(fiber.Map{"variants": items})
}

// AdminTopProducts placeholder — overview uses AdminOverview instead.
func (h *Handler) AdminTopProducts(c *fiber.Ctx) error {
	return notImplemented(c)
}
