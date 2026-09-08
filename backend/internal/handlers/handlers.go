// Package handlers contains stub implementations for every route registered
// in internal/routes. Each stub returns 501 Not Implemented and carries a
// TODO comment pointing at the relevant docs/SPEC.md section. Implement
// these one feature-group at a time (see the recommended Claude Code
// workflow in the project README) rather than all at once.
package handlers

import (
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

func New(db *pgxpool.Pool, rdb *redis.Client) *Handler {
	return &Handler{db: db, rdb: rdb}
}

func notImplemented(c *fiber.Ctx) error {
	return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
		"error": "not implemented yet",
	})
}

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msg})
}

func notFound(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": msg})
}

// internalError logs the underlying DB/infra error and returns a generic
// 500 to the client — never leak err.Error() in the response body.
func internalError(c *fiber.Ctx, context string, err error) error {
	log.Printf("%s: %v", context, err)
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": "internal server error",
	})
}

// --- Catalog (SPEC.md §2/3) ---

type category struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Slug     string      `json:"slug"`
	ParentID *string     `json:"parent_id,omitempty"`
	Position int         `json:"position"`
	Children []*category `json:"children,omitempty"`
}

// ListCategories returns all categories ordered by position, nested under
// their parent where parent_id is set.
func (h *Handler) ListCategories(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, slug, parent_id, position
		FROM categories
		ORDER BY position`)
	if err != nil {
		return internalError(c, "ListCategories query", err)
	}
	defer rows.Close()

	byID := make(map[string]*category)
	var order []string
	for rows.Next() {
		var cat category
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.ParentID, &cat.Position); err != nil {
			return internalError(c, "ListCategories scan", err)
		}
		byID[cat.ID] = &cat
		order = append(order, cat.ID)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "ListCategories rows", err)
	}

	roots := make([]*category, 0)
	for _, id := range order {
		cat := byID[id]
		if cat.ParentID == nil {
			roots = append(roots, cat)
			continue
		}
		if parent, ok := byID[*cat.ParentID]; ok {
			parent.Children = append(parent.Children, cat)
		} else {
			// Dangling parent_id (parent missing/filtered) — surface at top level
			// rather than silently dropping the category.
			roots = append(roots, cat)
		}
	}

	return c.JSON(fiber.Map{"categories": roots})
}

type variant struct {
	ID                string   `json:"id"`
	SKU               string   `json:"sku"`
	Size              *string  `json:"size,omitempty"`
	Color             *string  `json:"color,omitempty"`
	StockQty          int      `json:"stock_qty"`
	PriceOverride     *float64 `json:"price_override,omitempty"`
	LowStockThreshold int      `json:"low_stock_threshold"`
}

type productImage struct {
	ID        string  `json:"id"`
	VariantID *string `json:"variant_id,omitempty"`
	URL       string  `json:"url"`
	Position  int     `json:"position"`
}

type productListItem struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`
	CategoryID   *string       `json:"category_id,omitempty"`
	BasePrice    float64       `json:"base_price"`
	SalePrice    *float64      `json:"sale_price,omitempty"`
	IsBundle     bool          `json:"is_bundle"`
	CreatedAt    time.Time     `json:"created_at"`
	Variants     []variant     `json:"variants"`
	PrimaryImage *productImage `json:"primary_image,omitempty"`
}

var allowedSorts = map[string]string{
	// No real ranking/recommendation engine yet — "recommended" falls back
	// to latest-first, same as "latest". Revisit once one exists.
	"recommended": "p.created_at DESC",
	"latest":      "p.created_at DESC",
	"price_asc":   "COALESCE(p.sale_price, p.base_price) ASC",
	"price_desc":  "COALESCE(p.sale_price, p.base_price) DESC",
	"random":      "random()",
}

// ListProducts supports filtering by category slug, variant size/color,
// price range, sorting, and pagination.
func (h *Handler) ListProducts(c *fiber.Ctx) error {
	sortKey := c.Query("sort", "recommended")
	orderBy, ok := allowedSorts[sortKey]
	if !ok {
		return badRequest(c, "invalid sort value")
	}

	page := 1
	if v := c.Query("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return badRequest(c, "invalid page")
		}
		page = n
	}

	pageSize := 24
	if v := c.Query("page_size"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return badRequest(c, "invalid page_size")
		}
		if n > 100 {
			return badRequest(c, "page_size must be <= 100")
		}
		pageSize = n
	}

	var minPrice, maxPrice *float64
	if v := c.Query("min_price"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return badRequest(c, "invalid min_price")
		}
		minPrice = &f
	}
	if v := c.Query("max_price"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return badRequest(c, "invalid max_price")
		}
		maxPrice = &f
	}
	if minPrice != nil && maxPrice != nil && *minPrice > *maxPrice {
		return badRequest(c, "min_price must be <= max_price")
	}

	var b strings.Builder
	args := make([]any, 0, 8)
	b.WriteString(`SELECT p.id, p.name, p.slug, p.category_id, p.base_price,
		p.sale_price, p.is_bundle, p.created_at, COUNT(*) OVER() AS total_count
		FROM products p
		WHERE p.status = 'active'`)

	if v := c.Query("category"); v != "" {
		args = append(args, v)
		b.WriteString(" AND p.category_id = (SELECT id FROM categories WHERE slug = $" + strconv.Itoa(len(args)) + ")")
	}
	if v := c.Query("size"); v != "" {
		args = append(args, v)
		b.WriteString(" AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.size = $" + strconv.Itoa(len(args)) + ")")
	}
	if v := c.Query("color"); v != "" {
		args = append(args, v)
		b.WriteString(" AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.color = $" + strconv.Itoa(len(args)) + ")")
	}
	if minPrice != nil {
		args = append(args, *minPrice)
		b.WriteString(" AND COALESCE(p.sale_price, p.base_price) >= $" + strconv.Itoa(len(args)))
	}
	if maxPrice != nil {
		args = append(args, *maxPrice)
		b.WriteString(" AND COALESCE(p.sale_price, p.base_price) <= $" + strconv.Itoa(len(args)))
	}

	b.WriteString(" ORDER BY " + orderBy)

	args = append(args, pageSize)
	b.WriteString(" LIMIT $" + strconv.Itoa(len(args)))
	args = append(args, (page-1)*pageSize)
	b.WriteString(" OFFSET $" + strconv.Itoa(len(args)))

	rows, err := h.db.Query(c.Context(), b.String(), args...)
	if err != nil {
		return internalError(c, "ListProducts query", err)
	}
	defer rows.Close()

	products := make([]*productListItem, 0)
	ids := make([]string, 0)
	totalCount := 0
	for rows.Next() {
		var p productListItem
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.CategoryID, &p.BasePrice,
			&p.SalePrice, &p.IsBundle, &p.CreatedAt, &totalCount); err != nil {
			return internalError(c, "ListProducts scan", err)
		}
		p.Variants = make([]variant, 0)
		products = append(products, &p)
		ids = append(ids, p.ID)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "ListProducts rows", err)
	}

	if len(ids) > 0 {
		variantsByProduct, err := h.fetchVariantsByProduct(c, ids)
		if err != nil {
			return internalError(c, "ListProducts fetch variants", err)
		}
		imagesByProduct, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "ListProducts fetch images", err)
		}
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
		"page_size":   pageSize,
		"total_count": totalCount,
	})
}

// fetchVariantsByProduct batch-loads variants for a set of product IDs to
// avoid N+1 queries when assembling a product list.
func (h *Handler) fetchVariantsByProduct(c *fiber.Ctx, productIDs []string) (map[string][]variant, error) {
	rows, err := h.db.Query(c.Context(), `
		SELECT product_id, id, sku, size, color, stock_qty, price_override, low_stock_threshold
		FROM product_variants
		WHERE product_id = ANY($1)
		ORDER BY product_id, size, color`, productIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]variant)
	for rows.Next() {
		var productID string
		var v variant
		if err := rows.Scan(&productID, &v.ID, &v.SKU, &v.Size, &v.Color,
			&v.StockQty, &v.PriceOverride, &v.LowStockThreshold); err != nil {
			return nil, err
		}
		result[productID] = append(result[productID], v)
	}
	return result, rows.Err()
}

// fetchPrimaryImagesByProduct batch-loads each product's lowest-position
// image (regardless of variant) as its primary/listing image.
func (h *Handler) fetchPrimaryImagesByProduct(c *fiber.Ctx, productIDs []string) (map[string]*productImage, error) {
	rows, err := h.db.Query(c.Context(), `
		SELECT DISTINCT ON (product_id) product_id, id, variant_id, url, position
		FROM product_images
		WHERE product_id = ANY($1)
		ORDER BY product_id, position ASC`, productIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]*productImage)
	for rows.Next() {
		var productID string
		var img productImage
		if err := rows.Scan(&productID, &img.ID, &img.VariantID, &img.URL, &img.Position); err != nil {
			return nil, err
		}
		result[productID] = &img
	}
	return result, rows.Err()
}

type productDetail struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Slug        string         `json:"slug"`
	Description *string        `json:"description,omitempty"`
	Material    *string        `json:"material,omitempty"`
	BasePrice   float64        `json:"base_price"`
	SalePrice   *float64       `json:"sale_price,omitempty"`
	IsBundle    bool           `json:"is_bundle"`
	Category    *category      `json:"category,omitempty"`
	Variants    []variant      `json:"variants"`
	Images      []productImage `json:"images"`
}

// GetProductBySlug returns full product detail: variants (with stock),
// images, category, and the is_bundle flag. 404 if missing or inactive.
func (h *Handler) GetProductBySlug(c *fiber.Ctx) error {
	slug := c.Params("slug")

	var p productDetail
	var categoryID *string
	err := h.db.QueryRow(c.Context(), `
		SELECT id, name, slug, description, category_id, material, base_price, sale_price, is_bundle
		FROM products
		WHERE slug = $1 AND status = 'active'`, slug,
	).Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &categoryID, &p.Material, &p.BasePrice, &p.SalePrice, &p.IsBundle)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "product not found")
	}
	if err != nil {
		return internalError(c, "GetProductBySlug query product", err)
	}

	if categoryID != nil {
		var cat category
		err := h.db.QueryRow(c.Context(), `
			SELECT id, name, slug, parent_id, position
			FROM categories WHERE id = $1`, *categoryID,
		).Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.ParentID, &cat.Position)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return internalError(c, "GetProductBySlug query category", err)
		}
		if err == nil {
			p.Category = &cat
		}
	}

	variantRows, err := h.db.Query(c.Context(), `
		SELECT id, sku, size, color, stock_qty, price_override, low_stock_threshold
		FROM product_variants
		WHERE product_id = $1
		ORDER BY size, color`, p.ID)
	if err != nil {
		return internalError(c, "GetProductBySlug query variants", err)
	}
	p.Variants = make([]variant, 0)
	for variantRows.Next() {
		var v variant
		if err := variantRows.Scan(&v.ID, &v.SKU, &v.Size, &v.Color, &v.StockQty, &v.PriceOverride, &v.LowStockThreshold); err != nil {
			variantRows.Close()
			return internalError(c, "GetProductBySlug scan variant", err)
		}
		p.Variants = append(p.Variants, v)
	}
	if err := variantRows.Err(); err != nil {
		variantRows.Close()
		return internalError(c, "GetProductBySlug variant rows", err)
	}
	variantRows.Close()

	imageRows, err := h.db.Query(c.Context(), `
		SELECT id, variant_id, url, position
		FROM product_images
		WHERE product_id = $1
		ORDER BY position`, p.ID)
	if err != nil {
		return internalError(c, "GetProductBySlug query images", err)
	}
	p.Images = make([]productImage, 0)
	for imageRows.Next() {
		var img productImage
		if err := imageRows.Scan(&img.ID, &img.VariantID, &img.URL, &img.Position); err != nil {
			imageRows.Close()
			return internalError(c, "GetProductBySlug scan image", err)
		}
		p.Images = append(p.Images, img)
	}
	if err := imageRows.Err(); err != nil {
		imageRows.Close()
		return internalError(c, "GetProductBySlug image rows", err)
	}
	imageRows.Close()

	return c.JSON(p)
}

type relatedProduct struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`
	BasePrice    float64       `json:"base_price"`
	SalePrice    *float64      `json:"sale_price,omitempty"`
	IsBundle     bool          `json:"is_bundle"`
	PrimaryImage *productImage `json:"primary_image,omitempty"`
}

// GetRelatedProducts returns up to 6 active products from the same
// category as the given product, excluding the product itself.
func (h *Handler) GetRelatedProducts(c *fiber.Ctx) error {
	slug := c.Params("slug")

	var productID string
	var categoryID *string
	err := h.db.QueryRow(c.Context(), `
		SELECT id, category_id FROM products WHERE slug = $1 AND status = 'active'`, slug,
	).Scan(&productID, &categoryID)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "product not found")
	}
	if err != nil {
		return internalError(c, "GetRelatedProducts query product", err)
	}

	related := make([]*relatedProduct, 0)
	if categoryID == nil {
		return c.JSON(fiber.Map{"products": related})
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, slug, base_price, sale_price, is_bundle
		FROM products
		WHERE category_id = $1 AND id != $2 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 6`, *categoryID, productID)
	if err != nil {
		return internalError(c, "GetRelatedProducts query related", err)
	}
	defer rows.Close()

	ids := make([]string, 0, 6)
	for rows.Next() {
		var rp relatedProduct
		if err := rows.Scan(&rp.ID, &rp.Name, &rp.Slug, &rp.BasePrice, &rp.SalePrice, &rp.IsBundle); err != nil {
			return internalError(c, "GetRelatedProducts scan", err)
		}
		related = append(related, &rp)
		ids = append(ids, rp.ID)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "GetRelatedProducts rows", err)
	}

	if len(ids) > 0 {
		imagesByProduct, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "GetRelatedProducts fetch images", err)
		}
		for _, rp := range related {
			if img, ok := imagesByProduct[rp.ID]; ok {
				rp.PrimaryImage = img
			}
		}
	}

	return c.JSON(fiber.Map{"products": related})
}

type bundleComponent struct {
	ProductID string   `json:"product_id"`
	Name      string   `json:"name"`
	Slug      string   `json:"slug"`
	BasePrice float64  `json:"base_price"`
	SalePrice *float64 `json:"sale_price,omitempty"`
	Quantity  int      `json:"quantity"`
}

type bundleDetail struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	Description *string           `json:"description,omitempty"`
	BasePrice   float64           `json:"base_price"`
	SalePrice   *float64          `json:"sale_price,omitempty"`
	Components  []bundleComponent `json:"components"`
}

// GetBundleBySlug returns a bundle product plus its component products
// (via bundle_items) with each component's quantity.
func (h *Handler) GetBundleBySlug(c *fiber.Ctx) error {
	slug := c.Params("slug")

	var b bundleDetail
	err := h.db.QueryRow(c.Context(), `
		SELECT id, name, slug, description, base_price, sale_price
		FROM products
		WHERE slug = $1 AND is_bundle = true AND status = 'active'`, slug,
	).Scan(&b.ID, &b.Name, &b.Slug, &b.Description, &b.BasePrice, &b.SalePrice)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "bundle not found")
	}
	if err != nil {
		return internalError(c, "GetBundleBySlug query bundle", err)
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, bi.quantity
		FROM bundle_items bi
		JOIN products p ON p.id = bi.component_product_id
		WHERE bi.bundle_product_id = $1
		ORDER BY bi.id`, b.ID)
	if err != nil {
		return internalError(c, "GetBundleBySlug query components", err)
	}
	defer rows.Close()

	b.Components = make([]bundleComponent, 0)
	for rows.Next() {
		var comp bundleComponent
		if err := rows.Scan(&comp.ProductID, &comp.Name, &comp.Slug, &comp.BasePrice, &comp.SalePrice, &comp.Quantity); err != nil {
			return internalError(c, "GetBundleBySlug scan component", err)
		}
		b.Components = append(b.Components, comp)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "GetBundleBySlug rows", err)
	}

	return c.JSON(b)
}

// Presence handlers live in presence.go.

// Cart handlers live in cart.go.

// Checkout handlers live in checkout.go.
// M-Pesa handlers live in mpesa.go.

func (h *Handler) InitiateCardPayment(c *fiber.Ctx) error { return notImplemented(c) }

// Account handlers live in account.go.
// Gift card handlers live in gift_cards.go.
// Admin analytics handlers live in admin_analytics.go.

// Discount handlers live in discounts.go.
// Public reviews live in reviews_public.go.
// Activity feed lives in activity.go.
// Stylist handlers live in stylist.go.
// CMS handlers live in cms.go and admin_cms.go.

// --- Admin: overview & analytics in admin_analytics.go ---

// Admin catalog handlers live in admin_products.go and admin_bundles.go.
