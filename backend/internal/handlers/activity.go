package handlers

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

const activityRecentCacheKey = "activity:recent:v1"
const activityRecentCacheTTL = 30 * time.Second

type activityEventPublic struct {
	Type         string    `json:"type"`
	Name         string    `json:"name"`
	ItemName     *string   `json:"item_name,omitempty"`
	ThumbnailURL *string   `json:"thumbnail_url,omitempty"`
	Message      string    `json:"message"`
	CreatedAt    time.Time `json:"created_at"`
}

type recentPurchase struct {
	CustomerName string    `json:"customer_name"`
	ProductName  string    `json:"product_name"`
	ProductSlug  string    `json:"product_slug"`
	PurchasedAt  time.Time `json:"purchased_at"`
}

func firstNameOnly(fullName string) string {
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		return "Someone"
	}
	return strings.Fields(fullName)[0]
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

func activityMessage(typ, name string, item *string) string {
	itemName := "an item"
	if item != nil && *item != "" {
		itemName = *item
	}
	switch typ {
	case "purchase":
		return name + " bought " + itemName
	case "wishlist_add":
		return name + " saved " + itemName
	case "cart_add":
		return name + " added " + itemName + " to cart"
	case "newsletter_signup":
		return name + " signed up for the newsletter"
	default:
		return name + " was active"
	}
}

// emitActivity persists a social-proof event off the request path (fire-and-forget).
func (h *Handler) emitActivity(typ string, userID, productID, orderID *string, price *float64) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, err := h.db.Exec(ctx, `
			INSERT INTO activity_events (type, user_id, product_id, order_id, price_at_event)
			VALUES ($1, $2, $3, $4, $5)`,
			typ, userID, productID, orderID, price)
		if err != nil {
			log.Printf("emitActivity %s: %v", typ, err)
			return
		}
		if h.rdb != nil {
			_ = h.rdb.Del(ctx, activityRecentCacheKey).Err()
		}
	}()
}

func (h *Handler) productIDFromVariant(ctx context.Context, variantID string) (string, error) {
	var productID string
	err := h.db.QueryRow(ctx, `SELECT product_id FROM product_variants WHERE id = $1`, variantID).Scan(&productID)
	return productID, err
}

// RecentActivity returns the latest social-proof events for the storefront marquee.
func (h *Handler) RecentActivity(c *fiber.Ctx) error {
	limit := 20
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}

	if h.rdb != nil {
		if cached, err := h.rdb.Get(c.Context(), activityRecentCacheKey).Bytes(); err == nil && len(cached) > 0 {
			var payload fiber.Map
			if json.Unmarshal(cached, &payload) == nil {
				return c.JSON(payload)
			}
		}
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT
			ae.type,
			COALESCE(c.full_name, '') AS full_name,
			p.name AS product_name,
			(
				SELECT pi.url FROM product_images pi
				WHERE pi.product_id = ae.product_id
				ORDER BY pi.position, pi.id
				LIMIT 1
			) AS thumb,
			ae.created_at
		FROM activity_events ae
		LEFT JOIN customers c ON c.id = ae.user_id
		LEFT JOIN products p ON p.id = ae.product_id
		ORDER BY ae.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return internalError(c, "RecentActivity query", err)
	}
	defer rows.Close()

	events := make([]activityEventPublic, 0)
	for rows.Next() {
		var typ string
		var fullName string
		var productName pgtype.Text
		var thumb pgtype.Text
		var createdAt time.Time
		if err := rows.Scan(&typ, &fullName, &productName, &thumb, &createdAt); err != nil {
			return internalError(c, "RecentActivity scan", err)
		}
		name := firstNameOnly(fullName)
		var itemName *string
		if productName.Valid && productName.String != "" {
			s := productName.String
			itemName = &s
		}
		var thumbURL *string
		if thumb.Valid && thumb.String != "" {
			u := h.expandMedia(thumb.String)
			thumbURL = &u
		}
		events = append(events, activityEventPublic{
			Type:         typ,
			Name:         name,
			ItemName:     itemName,
			ThumbnailURL: thumbURL,
			Message:      activityMessage(typ, name, itemName),
			CreatedAt:    createdAt,
		})
	}

	payload := fiber.Map{"events": events}
	if h.rdb != nil {
		if b, err := json.Marshal(payload); err == nil {
			_ = h.rdb.Set(c.Context(), activityRecentCacheKey, b, activityRecentCacheTTL).Err()
		}
	}
	return c.JSON(payload)
}

// RecentPurchases returns recent order line items for the legacy corner ticker.
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
