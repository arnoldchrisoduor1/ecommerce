package handlers

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// searchILIKEPattern escapes LIKE metacharacters and wraps with wildcards.
func searchILIKEPattern(q string) string {
	q = strings.TrimSpace(q)
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + replacer.Replace(q) + "%"
}

// SearchProducts handles GET /api/products/search?q=&page=&limit=
// Case-insensitive ILIKE across name + description; name matches rank first.
// Only active products are returned.
func (h *Handler) SearchProducts(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		return c.JSON(fiber.Map{
			"products":    []any{},
			"page":        1,
			"limit":       24,
			"total_count": 0,
			"query":       q,
		})
	}

	page := 1
	if v := c.Query("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return badRequest(c, "invalid page")
		}
		page = n
	}

	limit := 24
	if v := c.Query("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return badRequest(c, "invalid limit")
		}
		if n > 100 {
			return badRequest(c, "limit must be <= 100")
		}
		limit = n
	}

	pattern := searchILIKEPattern(q)

	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.slug, p.category_id, p.base_price,
			p.sale_price, p.is_bundle, p.created_at, COUNT(*) OVER() AS total_count
		FROM products p
		WHERE p.status = 'active'
		  AND (
		    p.name ILIKE $1 ESCAPE '\'
		    OR COALESCE(p.description, '') ILIKE $1 ESCAPE '\'
		  )
		ORDER BY
		  CASE WHEN p.name ILIKE $1 ESCAPE '\' THEN 0 ELSE 1 END,
		  p.name ASC
		LIMIT $2 OFFSET $3`,
		pattern, limit, (page-1)*limit,
	)
	if err != nil {
		return internalError(c, "SearchProducts query", err)
	}
	defer rows.Close()

	products := make([]*productListItem, 0)
	ids := make([]string, 0)
	totalCount := 0
	for rows.Next() {
		var p productListItem
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.CategoryID, &p.BasePrice,
			&p.SalePrice, &p.IsBundle, &p.CreatedAt, &totalCount); err != nil {
			return internalError(c, "SearchProducts scan", err)
		}
		p.Variants = make([]variant, 0)
		products = append(products, &p)
		ids = append(ids, p.ID)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "SearchProducts rows", err)
	}

	if len(ids) > 0 {
		variantsByProduct, err := h.fetchVariantsByProduct(c, ids)
		if err != nil {
			return internalError(c, "SearchProducts fetch variants", err)
		}
		imagesByProduct, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "SearchProducts fetch images", err)
		}
		h.expandPrimaryImageMap(imagesByProduct)
		for _, p := range products {
			if vs, ok := variantsByProduct[p.ID]; ok {
				p.Variants = vs
			}
			if img, ok := imagesByProduct[p.ID]; ok {
				p.PrimaryImage = img
			}
		}
	}

	return c.JSON(fiber.Map{
		"products":    products,
		"page":        page,
		"limit":       limit,
		"total_count": totalCount,
		"query":       q,
	})
}
