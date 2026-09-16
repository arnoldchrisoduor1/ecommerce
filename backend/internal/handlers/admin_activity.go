package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

var activityAdminTypes = map[string]bool{
	"purchase":           true,
	"wishlist_add":       true,
	"cart_add":           true,
	"newsletter_signup":  true,
}

type adminActivityEvent struct {
	ID           string     `json:"id"`
	Type         string     `json:"type"`
	CreatedAt    time.Time  `json:"created_at"`
	CustomerID   *string    `json:"customer_id,omitempty"`
	CustomerName string     `json:"customer_name"`
	CustomerEmail *string   `json:"customer_email,omitempty"`
	IsGuest      bool       `json:"is_guest"`
	ProductID    *string    `json:"product_id,omitempty"`
	ProductName  *string    `json:"product_name,omitempty"`
	ProductSlug  *string    `json:"product_slug,omitempty"`
	ThumbnailURL *string    `json:"thumbnail_url,omitempty"`
	PriceAtEvent *float64   `json:"price_at_event,omitempty"`
	OrderID      *string    `json:"order_id,omitempty"`
	OrderTotal   *float64   `json:"order_total,omitempty"`
}

func parseActivityTypes(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if !activityAdminTypes[t] || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func (h *Handler) adminActivityWhere(
	from, to time.Time,
	types []string,
	q string,
	args *[]any,
) string {
	*args = append(*args, from, to)
	clauses := []string{"ae.created_at >= $1", "ae.created_at <= $2"}
	idx := 3
	if len(types) > 0 {
		clauses = append(clauses, fmt.Sprintf("ae.type = ANY($%d)", idx))
		*args = append(*args, types)
		idx++
	}
	q = strings.TrimSpace(q)
	if q != "" {
		like := "%" + strings.ToLower(q) + "%"
		clauses = append(clauses, fmt.Sprintf(`(
			lower(COALESCE(c.full_name, '')) LIKE $%d
			OR lower(COALESCE(c.email, '')) LIKE $%d
			OR lower(COALESCE(p.name, '')) LIKE $%d
			OR CAST(ae.order_id AS text) LIKE $%d
		)`, idx, idx, idx, idx))
		*args = append(*args, like)
		idx++
	}
	_ = idx
	return strings.Join(clauses, " AND ")
}

// AdminActivityFeed returns a paginated privileged activity feed.
func (h *Handler) AdminActivityFeed(c *fiber.Ctx) error {
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	types := parseActivityTypes(c.Query("types"))
	q := c.Query("q")
	page := 1
	if v := c.Query("page"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 {
			page = n
		}
	}
	limit := 25
	if v := c.Query("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	offset := (page - 1) * limit

	args := make([]any, 0, 8)
	where := h.adminActivityWhere(from, to, types, q, &args)

	var total int64
	countSQL := `
		SELECT COUNT(*)::bigint
		FROM activity_events ae
		LEFT JOIN customers c ON c.id = ae.user_id
		LEFT JOIN products p ON p.id = ae.product_id
		WHERE ` + where
	if err := h.db.QueryRow(c.Context(), countSQL, args...).Scan(&total); err != nil {
		return internalError(c, "AdminActivityFeed count", err)
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	limIdx := len(args) + 1
	offIdx := len(args) + 2
	rows, err := h.db.Query(c.Context(), fmt.Sprintf(`
		SELECT
			ae.id, ae.type, ae.created_at,
			ae.user_id, COALESCE(c.full_name, ''), c.email, COALESCE(c.is_guest, true),
			ae.product_id, p.name, p.slug,
			(
				SELECT pi.url FROM product_images pi
				WHERE pi.product_id = ae.product_id
				ORDER BY pi.position, pi.id LIMIT 1
			) AS thumb,
			ae.price_at_event,
			ae.order_id, o.total
		FROM activity_events ae
		LEFT JOIN customers c ON c.id = ae.user_id
		LEFT JOIN products p ON p.id = ae.product_id
		LEFT JOIN orders o ON o.id = ae.order_id
		WHERE %s
		ORDER BY ae.created_at DESC, ae.id DESC
		LIMIT $%d OFFSET $%d`, where, limIdx, offIdx), listArgs...)
	if err != nil {
		return internalError(c, "AdminActivityFeed query", err)
	}
	defer rows.Close()

	events := make([]adminActivityEvent, 0, limit)
	for rows.Next() {
		var ev adminActivityEvent
		var custID, email, productID, productName, productSlug, thumb, orderID pgtype.Text
		var price, orderTotal pgtype.Float8
		var isGuest bool
		if err := rows.Scan(
			&ev.ID, &ev.Type, &ev.CreatedAt,
			&custID, &ev.CustomerName, &email, &isGuest,
			&productID, &productName, &productSlug, &thumb,
			&price, &orderID, &orderTotal,
		); err != nil {
			return internalError(c, "AdminActivityFeed scan", err)
		}
		ev.IsGuest = isGuest
		if custID.Valid {
			s := custID.String
			ev.CustomerID = &s
		}
		if email.Valid && email.String != "" {
			s := email.String
			ev.CustomerEmail = &s
		}
		if ev.CustomerName == "" {
			if ev.CustomerID == nil {
				ev.CustomerName = "Guest"
			} else {
				ev.CustomerName = "Customer"
			}
		}
		if productID.Valid {
			s := productID.String
			ev.ProductID = &s
		}
		if productName.Valid && productName.String != "" {
			s := productName.String
			ev.ProductName = &s
		}
		if productSlug.Valid && productSlug.String != "" {
			s := productSlug.String
			ev.ProductSlug = &s
		}
		if thumb.Valid && thumb.String != "" {
			u := h.expandMedia(thumb.String)
			ev.ThumbnailURL = &u
		}
		if price.Valid {
			v := price.Float64
			ev.PriceAtEvent = &v
		}
		if orderID.Valid {
			s := orderID.String
			ev.OrderID = &s
		}
		if orderTotal.Valid {
			v := orderTotal.Float64
			ev.OrderTotal = &v
		}
		events = append(events, ev)
	}

	pages := int((total + int64(limit) - 1) / int64(limit))
	if pages == 0 {
		pages = 1
	}
	return c.JSON(fiber.Map{
		"events": events,
		"page":   page,
		"limit":  limit,
		"total":  total,
		"pages":  pages,
		"from":   from.Format("2006-01-02"),
		"to":     to.Format("2006-01-02"),
	})
}

// AdminActivitySummary returns per-type counts for the selected range (+ search).
func (h *Handler) AdminActivitySummary(c *fiber.Ctx) error {
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	q := c.Query("q")
	args := make([]any, 0, 4)
	// Summary ignores type filter so strip always shows full distribution for range/search.
	where := h.adminActivityWhere(from, to, nil, q, &args)

	rows, err := h.db.Query(c.Context(), `
		SELECT ae.type, COUNT(*)::bigint
		FROM activity_events ae
		LEFT JOIN customers c ON c.id = ae.user_id
		LEFT JOIN products p ON p.id = ae.product_id
		WHERE `+where+`
		GROUP BY ae.type`, args...)
	if err != nil {
		return internalError(c, "AdminActivitySummary", err)
	}
	defer rows.Close()

	counts := map[string]int64{
		"purchase":          0,
		"wishlist_add":      0,
		"cart_add":          0,
		"newsletter_signup": 0,
	}
	var total int64
	for rows.Next() {
		var typ string
		var n int64
		if err := rows.Scan(&typ, &n); err != nil {
			return internalError(c, "AdminActivitySummary scan", err)
		}
		counts[typ] = n
		total += n
	}
	return c.JSON(fiber.Map{"counts": counts, "total": total})
}

// AdminActivityExportCSV streams the filtered feed as CSV.
func (h *Handler) AdminActivityExportCSV(c *fiber.Ctx) error {
	from, to, err := parseDateRange(c)
	if err != nil {
		return badRequest(c, "invalid from/to date (use YYYY-MM-DD)")
	}
	types := parseActivityTypes(c.Query("types"))
	q := c.Query("q")
	args := make([]any, 0, 8)
	where := h.adminActivityWhere(from, to, types, q, &args)

	rows, err := h.db.Query(c.Context(), `
		SELECT
			ae.created_at, ae.type,
			COALESCE(c.full_name, 'Guest'), COALESCE(c.email, ''),
			COALESCE(p.name, ''), COALESCE(p.slug, ''),
			ae.price_at_event, ae.order_id, o.total
		FROM activity_events ae
		LEFT JOIN customers c ON c.id = ae.user_id
		LEFT JOIN products p ON p.id = ae.product_id
		LEFT JOIN orders o ON o.id = ae.order_id
		WHERE `+where+`
		ORDER BY ae.created_at DESC
		LIMIT 5000`, args...)
	if err != nil {
		return internalError(c, "AdminActivityExportCSV", err)
	}
	defer rows.Close()

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="activity-export.csv"`)
	var b strings.Builder
	b.WriteString("created_at,type,customer_name,customer_email,product_name,product_slug,price_at_event,order_id,order_total\n")
	for rows.Next() {
		var createdAt time.Time
		var typ, name, email, productName, productSlug string
		var price, orderTotal pgtype.Float8
		var orderID pgtype.Text
		if err := rows.Scan(&createdAt, &typ, &name, &email, &productName, &productSlug, &price, &orderID, &orderTotal); err != nil {
			return internalError(c, "AdminActivityExportCSV scan", err)
		}
		priceS, totalS, oid := "", "", ""
		if price.Valid {
			priceS = fmt.Sprintf("%.2f", price.Float64)
		}
		if orderTotal.Valid {
			totalS = fmt.Sprintf("%.2f", orderTotal.Float64)
		}
		if orderID.Valid {
			oid = orderID.String
		}
		b.WriteString(fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
			csvEscape(createdAt.UTC().Format(time.RFC3339)),
			csvEscape(typ),
			csvEscape(name),
			csvEscape(email),
			csvEscape(productName),
			csvEscape(productSlug),
			csvEscape(priceS),
			csvEscape(oid),
			csvEscape(totalS),
		))
	}
	return c.SendString(b.String())
}

func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n\r") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}
