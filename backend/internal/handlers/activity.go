package handlers

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type recentPurchase struct {
	CustomerName string    `json:"customer_name"`
	ProductName  string    `json:"product_name"`
	ProductSlug  string    `json:"product_slug"`
	PurchasedAt  time.Time `json:"purchased_at"`
}

func obfuscateCustomerName(fullName string) string {
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		return "Someone"
	}
	parts := strings.Fields(fullName)
	first := parts[0]
	r := []rune(first)
	if len(r) == 1 {
		return string(r) + "."
	}
	return string(r[0]) + strings.Repeat("*", len(r)-1)
}

func nameFromShippingAddress(raw []byte) string {
	if len(raw) == 0 {
		return "Someone"
	}
	var addr struct {
		Line1 string `json:"line1"`
	}
	if err := json.Unmarshal(raw, &addr); err != nil || addr.Line1 == "" {
		return "Someone"
	}
	parts := strings.Fields(addr.Line1)
	if len(parts) == 0 {
		return "Someone"
	}
	return obfuscateCustomerName(parts[0])
}

// RecentPurchases returns recent order line items for the sitewide ticker.
func (h *Handler) RecentPurchases(c *fiber.Ctx) error {
	limit := 10
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT
			COALESCE(c.full_name, '') AS customer_name,
			o.shipping_address,
			p.name,
			p.slug,
			o.created_at
		FROM orders o
		JOIN order_items oi ON oi.order_id = o.id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN customers c ON c.id = o.customer_id
		WHERE o.status IN ('paid', 'fulfilled')
		ORDER BY o.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return internalError(c, "RecentPurchases query", err)
	}
	defer rows.Close()

	purchases := make([]recentPurchase, 0)
	for rows.Next() {
		var rp recentPurchase
		var customerName string
		var shippingAddr []byte
		if err := rows.Scan(&customerName, &shippingAddr, &rp.ProductName, &rp.ProductSlug, &rp.PurchasedAt); err != nil {
			return internalError(c, "RecentPurchases scan", err)
		}
		if customerName != "" {
			rp.CustomerName = obfuscateCustomerName(customerName)
		} else {
			rp.CustomerName = nameFromShippingAddress(shippingAddr)
		}
		purchases = append(purchases, rp)
	}
	return c.JSON(fiber.Map{"purchases": purchases})
}
