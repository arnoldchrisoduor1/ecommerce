package handlers

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminProduct struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Slug         string         `json:"slug"`
	Description  *string        `json:"description,omitempty"`
	CategoryID   *string        `json:"category_id,omitempty"`
	Material     *string        `json:"material,omitempty"`
	BasePrice    float64        `json:"base_price"`
	SalePrice    *float64       `json:"sale_price,omitempty"`
	IsBundle     bool           `json:"is_bundle"`
	Status       string         `json:"status"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	Variants     []variant      `json:"variants,omitempty"`
	Images       []productImage `json:"images,omitempty"`
	PrimaryImage *productImage  `json:"primary_image,omitempty"`
}

type adminProductInput struct {
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Description *string  `json:"description"`
	CategoryID  *string  `json:"category_id"`
	Material    *string  `json:"material"`
	BasePrice   float64  `json:"base_price"`
	SalePrice   *float64 `json:"sale_price"`
	Status      string   `json:"status"`
}

type adminVariantInput struct {
	SKU               string   `json:"sku"`
	Size              *string  `json:"size"`
	Color             *string  `json:"color"`
	StockQty          int      `json:"stock_qty"`
	PriceOverride     *float64 `json:"price_override"`
	LowStockThreshold int      `json:"low_stock_threshold"`
}

func normalizeSlug(slug string) string {
	return strings.Trim(strings.ToLower(slug), " ")
}

func validateProductStatus(status string) bool {
	switch status {
	case "draft", "active", "archived":
		return true
	default:
		return false
	}
}

func (h *Handler) loadAdminProduct(c *fiber.Ctx, productID string, withVariants bool) (*adminProduct, error) {
	var p adminProduct
	err := h.db.QueryRow(c.Context(), `
		SELECT id, name, slug, description, category_id, material, base_price, sale_price,
			is_bundle, status, created_at, updated_at
		FROM products WHERE id = $1`, productID,
	).Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &p.CategoryID, &p.Material,
		&p.BasePrice, &p.SalePrice, &p.IsBundle, &p.Status, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}

	if withVariants {
		rows, err := h.db.Query(c.Context(), `
			SELECT id, sku, size, color, stock_qty, price_override, low_stock_threshold
			FROM product_variants WHERE product_id = $1 ORDER BY sku`, productID)
		if err != nil {
			return nil, err
		}
		p.Variants = make([]variant, 0)
		for rows.Next() {
			var v variant
			if err := rows.Scan(&v.ID, &v.SKU, &v.Size, &v.Color, &v.StockQty, &v.PriceOverride, &v.LowStockThreshold); err != nil {
				rows.Close()
				return nil, err
			}
			p.Variants = append(p.Variants, v)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	imgRows, err := h.db.Query(c.Context(), `
		SELECT id, variant_id, url, position
		FROM product_images
		WHERE product_id = $1
		ORDER BY position`, productID)
	if err != nil {
		return nil, err
	}
	p.Images = make([]productImage, 0)
	for imgRows.Next() {
		var img productImage
		if err := imgRows.Scan(&img.ID, &img.VariantID, &img.URL, &img.Position); err != nil {
			imgRows.Close()
			return nil, err
		}
		p.Images = append(p.Images, img)
	}
	if err := imgRows.Err(); err != nil {
		imgRows.Close()
		return nil, err
	}
	imgRows.Close()
	if len(p.Images) > 0 {
		p.PrimaryImage = &p.Images[0]
	}

	return &p, nil
}

func (h *Handler) AdminListProducts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, slug, description, category_id, material, base_price, sale_price,
			is_bundle, status, created_at, updated_at
		FROM products
		WHERE is_bundle = false
		ORDER BY updated_at DESC`)
	if err != nil {
		return internalError(c, "AdminListProducts query", err)
	}
	defer rows.Close()

	products := make([]adminProduct, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var p adminProduct
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &p.CategoryID, &p.Material,
			&p.BasePrice, &p.SalePrice, &p.IsBundle, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return internalError(c, "AdminListProducts scan", err)
		}
		products = append(products, p)
		ids = append(ids, p.ID)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "AdminListProducts rows", err)
	}

	if len(ids) > 0 {
		images, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "AdminListProducts images", err)
		}
		for i := range products {
			if img, ok := images[products[i].ID]; ok {
				products[i].PrimaryImage = img
			}
		}
	}

	return c.JSON(fiber.Map{"products": products})
}

func (h *Handler) AdminCreateProduct(c *fiber.Ctx) error {
	var req adminProductInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.Slug = normalizeSlug(req.Slug)
	if req.Name == "" || req.Slug == "" {
		return badRequest(c, "name and slug are required")
	}
	if req.BasePrice < 0 {
		return badRequest(c, "base_price must be >= 0")
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	if !validateProductStatus(status) {
		return badRequest(c, "invalid status")
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO products (name, slug, description, category_id, material, base_price, sale_price, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		req.Name, req.Slug, req.Description, req.CategoryID, req.Material, req.BasePrice, req.SalePrice, status,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminCreateProduct insert", err)
	}

	p, err := h.loadAdminProduct(c, id, true)
	if err != nil {
		return internalError(c, "AdminCreateProduct load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(p)
}

func (h *Handler) AdminGetProduct(c *fiber.Ctx) error {
	id := c.Params("id")
	p, err := h.loadAdminProduct(c, id, true)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "product not found")
	}
	if err != nil {
		return internalError(c, "AdminGetProduct load", err)
	}
	if p.IsBundle {
		return notFound(c, "product not found")
	}
	return c.JSON(p)
}

func (h *Handler) AdminUpdateProduct(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminProductInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Name == "" {
		return badRequest(c, "name is required")
	}
	if req.Slug != "" {
		req.Slug = normalizeSlug(req.Slug)
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	if !validateProductStatus(status) {
		return badRequest(c, "invalid status")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE products
		SET name = $1,
			slug = COALESCE(NULLIF($2, ''), slug),
			description = $3,
			category_id = $4,
			material = $5,
			base_price = $6,
			sale_price = $7,
			status = $8,
			updated_at = now()
		WHERE id = $9 AND is_bundle = false`,
		req.Name, req.Slug, req.Description, req.CategoryID, req.Material,
		req.BasePrice, req.SalePrice, status, id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminUpdateProduct update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "product not found")
	}

	p, err := h.loadAdminProduct(c, id, true)
	if err != nil {
		return internalError(c, "AdminUpdateProduct load", err)
	}
	return c.JSON(p)
}

func (h *Handler) AdminDeleteProduct(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(), `DELETE FROM products WHERE id = $1 AND is_bundle = false`, id)
	if err != nil {
		return internalError(c, "AdminDeleteProduct delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "product not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) AdminCreateVariant(c *fiber.Ctx) error {
	productID := c.Params("id")
	var req adminVariantInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.SKU == "" {
		return badRequest(c, "sku is required")
	}
	if req.StockQty < 0 {
		return badRequest(c, "stock_qty must be >= 0")
	}
	if req.LowStockThreshold <= 0 {
		req.LowStockThreshold = 5
	}

	var isBundle bool
	err := h.db.QueryRow(c.Context(), `SELECT is_bundle FROM products WHERE id = $1`, productID).Scan(&isBundle)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "product not found")
	}
	if err != nil {
		return internalError(c, "AdminCreateVariant load product", err)
	}
	if isBundle {
		return badRequest(c, "cannot add variants to a bundle product")
	}

	var variantID string
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO product_variants (product_id, sku, size, color, stock_qty, price_override, low_stock_threshold)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`,
		productID, req.SKU, req.Size, req.Color, req.StockQty, req.PriceOverride, req.LowStockThreshold,
	).Scan(&variantID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "sku already exists")
		}
		return internalError(c, "AdminCreateVariant insert", err)
	}

	_, err = h.db.Exec(c.Context(), `UPDATE products SET updated_at = now() WHERE id = $1`, productID)
	if err != nil {
		return internalError(c, "AdminCreateVariant touch product", err)
	}

	p, err := h.loadAdminProduct(c, productID, true)
	if err != nil {
		return internalError(c, "AdminCreateVariant load product", err)
	}
	return c.Status(fiber.StatusCreated).JSON(p)
}

func (h *Handler) AdminUpdateVariant(c *fiber.Ctx) error {
	productID := c.Params("id")
	variantID := c.Params("variantId")
	var req adminVariantInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.SKU == "" {
		return badRequest(c, "sku is required")
	}
	if req.StockQty < 0 {
		return badRequest(c, "stock_qty must be >= 0")
	}
	if req.LowStockThreshold <= 0 {
		req.LowStockThreshold = 5
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE product_variants
		SET sku = $1, size = $2, color = $3, stock_qty = $4,
			price_override = $5, low_stock_threshold = $6
		WHERE id = $7 AND product_id = $8`,
		req.SKU, req.Size, req.Color, req.StockQty, req.PriceOverride, req.LowStockThreshold,
		variantID, productID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "sku already exists")
		}
		return internalError(c, "AdminUpdateVariant update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "variant not found")
	}

	p, err := h.loadAdminProduct(c, productID, true)
	if err != nil {
		return internalError(c, "AdminUpdateVariant load product", err)
	}
	return c.JSON(p)
}

func (h *Handler) AdminDeleteVariant(c *fiber.Ctx) error {
	productID := c.Params("id")
	variantID := c.Params("variantId")

	tag, err := h.db.Exec(c.Context(), `
		DELETE FROM product_variants WHERE id = $1 AND product_id = $2`, variantID, productID)
	if err != nil {
		return internalError(c, "AdminDeleteVariant delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "variant not found")
	}

	p, err := h.loadAdminProduct(c, productID, true)
	if err != nil {
		return internalError(c, "AdminDeleteVariant load product", err)
	}
	return c.JSON(p)
}

func (h *Handler) AdminAddProductImage(c *fiber.Ctx) error {
	productID := c.Params("id")
	var exists bool
	err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists)
	if err != nil {
		return internalError(c, "AdminAddProductImage product check", err)
	}
	if !exists {
		return notFound(c, "product not found")
	}

	var req struct {
		URL       string  `json:"url"`
		VariantID *string `json:"variant_id"`
		Position  *int    `json:"position"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		return badRequest(c, "url is required")
	}

	var variantPtr *string
	if req.VariantID != nil && strings.TrimSpace(*req.VariantID) != "" {
		variantID := strings.TrimSpace(*req.VariantID)
		var ok bool
		err := h.db.QueryRow(c.Context(), `
			SELECT EXISTS(SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2)`,
			variantID, productID,
		).Scan(&ok)
		if err != nil {
			return internalError(c, "AdminAddProductImage variant check", err)
		}
		if !ok {
			return badRequest(c, "variant_id does not belong to this product")
		}
		variantPtr = &variantID
	}

	position := 0
	if req.Position != nil {
		if *req.Position < 0 {
			return badRequest(c, "invalid position")
		}
		position = *req.Position
	} else {
		_ = h.db.QueryRow(c.Context(), `
			SELECT COALESCE(MAX(position), -1) + 1 FROM product_images WHERE product_id = $1`,
			productID,
		).Scan(&position)
	}

	var img productImage
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO product_images (product_id, variant_id, url, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id, variant_id, url, position`,
		productID, variantPtr, req.URL, position,
	).Scan(&img.ID, &img.VariantID, &img.URL, &img.Position)
	if err != nil {
		return internalError(c, "AdminAddProductImage insert", err)
	}

	_, _ = h.db.Exec(c.Context(), `UPDATE products SET updated_at = now() WHERE id = $1`, productID)
	return c.Status(fiber.StatusCreated).JSON(img)
}

func (h *Handler) AdminDeleteProductImage(c *fiber.Ctx) error {
	productID := c.Params("id")
	imageID := c.Params("imageId")

	tag, err := h.db.Exec(c.Context(), `
		DELETE FROM product_images WHERE id = $1 AND product_id = $2`, imageID, productID)
	if err != nil {
		return internalError(c, "AdminDeleteProductImage delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "image not found")
	}

	_, _ = h.db.Exec(c.Context(), `UPDATE products SET updated_at = now() WHERE id = $1`, productID)
	return c.SendStatus(fiber.StatusNoContent)
}
