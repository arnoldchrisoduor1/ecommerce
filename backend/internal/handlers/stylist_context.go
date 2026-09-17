package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

var stylistStopwords = map[string]struct{}{
	"the": {}, "and": {}, "for": {}, "are": {}, "but": {}, "not": {}, "you": {},
	"all": {}, "can": {}, "her": {}, "was": {}, "one": {}, "our": {}, "out": {},
	"day": {}, "get": {}, "has": {}, "him": {}, "his": {}, "how": {}, "its": {},
	"may": {}, "new": {}, "now": {}, "old": {}, "see": {}, "two": {}, "way": {},
	"who": {}, "did": {}, "let": {}, "put": {}, "say": {}, "she": {}, "too": {},
	"use": {}, "any": {}, "with": {}, "that": {}, "this": {}, "from": {}, "have": {},
	"what": {}, "when": {}, "your": {}, "about": {}, "would": {}, "there": {}, "their": {},
	"could": {}, "should": {}, "some": {}, "like": {}, "want": {}, "need": {}, "looking": {},
}

func extractStylistKeywords(message string) []string {
	words := strings.FieldsFunc(strings.ToLower(message), func(r rune) bool {
		return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'))
	})
	out := make([]string, 0, len(words))
	seen := make(map[string]struct{})
	for _, w := range words {
		if len(w) < 3 {
			continue
		}
		if _, skip := stylistStopwords[w]; skip {
			continue
		}
		if _, dup := seen[w]; dup {
			continue
		}
		seen[w] = struct{}{}
		out = append(out, w)
	}
	return out
}

func (h *Handler) buildStylistContext(c *fiber.Ctx, userMessage string) (string, error) {
	var b strings.Builder

	keywords := extractStylistKeywords(userMessage)
	b.WriteString("Context selection: keyword match on product name/description")
	if len(keywords) > 0 {
		fmt.Fprintf(&b, " (%s)", strings.Join(keywords, ", "))
	} else {
		b.WriteString(" (none — showing latest in-stock items)")
	}
	b.WriteString(".\n\n")

	products, err := h.loadStylistProducts(c, keywords, 8)
	if err != nil {
		return "", err
	}
	b.WriteString("Relevant products (name | slug | price KES | category | stock | material):\n")
	for _, p := range products {
		fmt.Fprintf(&b, "- %s | %s | %.2f | %s | %s | %s\n",
			p.Name, p.Slug, p.Price, p.Category, p.Stock, p.Material)
	}
	b.WriteString("\n")

	discounts, err := h.loadActiveDiscounts(c)
	if err != nil {
		return "", err
	}
	if len(discounts) > 0 {
		b.WriteString("Active promotions:\n")
		for _, d := range discounts {
			val := fmt.Sprintf("%.0f%% off", d.Value)
			if d.Type == "fixed" {
				val = fmt.Sprintf("KES %.0f off", d.Value)
			}
			fmt.Fprintf(&b, "- Code %s: %s (%s)\n", d.Code, val, d.Context)
		}
		b.WriteString("\n")
	}

	policies, err := h.loadStorePolicies(c)
	if err != nil {
		return "", err
	}
	if policies != "" {
		b.WriteString("Store policies & announcements:\n")
		b.WriteString(policies)
	}

	return b.String(), nil
}

type stylistProduct struct {
	Name     string
	Slug     string
	Price    float64
	Category string
	Stock    string
	Material string
}

func (h *Handler) loadStylistProducts(c *fiber.Ctx, keywords []string, limit int) ([]stylistProduct, error) {
	products := make([]stylistProduct, 0, limit)

	if len(keywords) > 0 {
		pattern := searchILIKEPattern(strings.Join(keywords, " "))
		rows, err := h.db.Query(c.Context(), `
			SELECT p.name, p.slug, COALESCE(p.sale_price, p.base_price)::float8,
				COALESCE(c.name, 'Uncategorized'), COALESCE(p.material, ''),
				COALESCE(SUM(pv.stock_qty), 0)::int AS total_stock
			FROM products p
			LEFT JOIN categories c ON c.id = p.category_id
			LEFT JOIN product_variants pv ON pv.product_id = p.id
			WHERE p.status = 'active' AND p.is_bundle = false
			  AND (
			    p.name ILIKE $1 ESCAPE '\'
			    OR COALESCE(p.description, '') ILIKE $1 ESCAPE '\'
			    OR COALESCE(p.material, '') ILIKE $1 ESCAPE '\'
			  )
			GROUP BY p.id, c.name
			ORDER BY
			  CASE WHEN p.name ILIKE $1 ESCAPE '\' THEN 0 ELSE 1 END,
			  p.name ASC
			LIMIT $2`, pattern, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var p stylistProduct
			var stock int
			if err := rows.Scan(&p.Name, &p.Slug, &p.Price, &p.Category, &p.Material, &stock); err != nil {
				return nil, err
			}
			p.Stock = stockLabel(stock)
			products = append(products, p)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	if len(products) < 4 {
		rows, err := h.db.Query(c.Context(), `
			SELECT p.name, p.slug, COALESCE(p.sale_price, p.base_price)::float8,
				COALESCE(c.name, 'Uncategorized'), COALESCE(p.material, ''),
				COALESCE(SUM(pv.stock_qty), 0)::int AS total_stock
			FROM products p
			LEFT JOIN categories c ON c.id = p.category_id
			LEFT JOIN product_variants pv ON pv.product_id = p.id
			WHERE p.status = 'active' AND p.is_bundle = false
			GROUP BY p.id, c.name
			ORDER BY p.created_at DESC
			LIMIT $1`, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		seen := make(map[string]struct{})
		for _, p := range products {
			seen[p.Slug] = struct{}{}
		}
		for rows.Next() {
			var p stylistProduct
			var stock int
			if err := rows.Scan(&p.Name, &p.Slug, &p.Price, &p.Category, &p.Material, &stock); err != nil {
				return nil, err
			}
			if _, dup := seen[p.Slug]; dup {
				continue
			}
			p.Stock = stockLabel(stock)
			products = append(products, p)
			if len(products) >= limit {
				break
			}
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	return products, nil
}

func stockLabel(qty int) string {
	switch {
	case qty <= 0:
		return "out of stock"
	case qty <= 5:
		return "low stock"
	default:
		return "in stock"
	}
}

type activeDiscount struct {
	Code    string
	Type    string
	Value   float64
	Context string
}

func (h *Handler) loadActiveDiscounts(c *fiber.Ctx) ([]activeDiscount, error) {
	now := time.Now()
	rows, err := h.db.Query(c.Context(), `
		SELECT code, type, value, context
		FROM discounts
		WHERE is_active = true
		  AND (active_from IS NULL OR active_from <= $1)
		  AND (active_to IS NULL OR active_to >= $1)
		ORDER BY code
		LIMIT 10`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]activeDiscount, 0)
	for rows.Next() {
		var d activeDiscount
		if err := rows.Scan(&d.Code, &d.Type, &d.Value, &d.Context); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (h *Handler) loadStorePolicies(c *fiber.Ctx) (string, error) {
	var b strings.Builder

	var annData []byte
	err := h.db.QueryRow(c.Context(), `
		SELECT data FROM content_blocks WHERE key = 'announcement_bar' AND is_active = true`,
	).Scan(&annData)
	if err == nil {
		var block struct {
			Messages []string `json:"messages"`
			Message  string   `json:"message"`
		}
		if json.Unmarshal(annData, &block) == nil {
			msgs := block.Messages
			if len(msgs) == 0 && block.Message != "" {
				msgs = []string{block.Message}
			}
			for _, m := range msgs {
				fmt.Fprintf(&b, "- %s\n", m)
			}
		}
	}

	var delData []byte
	err = h.db.QueryRow(c.Context(), `
		SELECT data FROM content_blocks WHERE key = 'delivery_estimate' AND is_active = true`,
	).Scan(&delData)
	if err == nil {
		var est struct {
			MinDays int `json:"min_days"`
			MaxDays int `json:"max_days"`
		}
		if json.Unmarshal(delData, &est) == nil && est.MaxDays > 0 {
			fmt.Fprintf(&b, "- Standard delivery estimate: %d–%d business days\n", est.MinDays, est.MaxDays)
		}
	}

	return b.String(), nil
}

func stylistSystemPrompt(storeContext string) string {
	return `You are a fashion stylist for a women's basics storefront. Recommend ONLY products from the catalog below. Keep answers concise and actionable.

When you recommend a specific catalog product, append a marker on its own: [[product:SLUG]] using the exact slug from the catalog. Never invent slugs or products that are not listed. If nothing in the catalog fits, say so clearly without markers.

Privacy: You have NO access to any customer's order history, account details, addresses, or analytics about other shoppers. If asked about personal orders, what someone else bought, or private account data, politely decline in a friendly way and suggest they check their account page or contact support — do not invent or guess private information.

` + storeContext
}

func mockStylistReply(userMessage, storeContext string) string {
	lower := strings.ToLower(userMessage)
	if strings.Contains(lower, "order") || strings.Contains(lower, "last time") ||
		strings.Contains(lower, "who else") || strings.Contains(lower, "my account") {
		return "I don't have access to order history or account details — that's private to your account. Check Your Orders in your profile, or contact support for help."
	}
	if strings.Contains(lower, "spacesuit") || strings.Contains(lower, "not in stock") ||
		strings.Contains(lower, "unicorn") || strings.Contains(lower, "jetpack") {
		return "I don't see anything like that in our current catalog — we focus on everyday women's basics. Want a soft tee or tank instead?"
	}

	reply := strings.Builder{}
	reply.WriteString("Here are a few picks from our current catalog:\n")
	lines := strings.Split(storeContext, "\n")
	picks := 0
	for _, line := range lines {
		if strings.HasPrefix(line, "- ") && strings.Contains(line, " | ") && picks < 3 {
			parts := strings.Split(line, " | ")
			if len(parts) >= 2 {
				name := strings.TrimPrefix(parts[0], "- ")
				slug := strings.TrimSpace(parts[1])
				reply.WriteString(name)
				reply.WriteString(" — great everyday piece. [[product:")
				reply.WriteString(slug)
				reply.WriteString("]]\n")
				picks++
			}
		}
	}
	if strings.Contains(storeContext, "Active promotions:") {
		for _, line := range lines {
			if strings.HasPrefix(line, "- Code ") {
				reply.WriteString("\n")
				reply.WriteString(line)
				reply.WriteString(" — mention this at checkout.")
				break
			}
		}
	}
	if strings.Contains(storeContext, "Free delivery") {
		reply.WriteString("\n\n")
		for _, line := range lines {
			if strings.Contains(strings.ToLower(line), "free delivery") {
				reply.WriteString(strings.TrimPrefix(line, "- "))
				break
			}
		}
	}
	if picks == 0 {
		reply.WriteString("Browse our latest basics — soft tees, tanks, and layers for everyday wear.")
	}
	return reply.String()
}
