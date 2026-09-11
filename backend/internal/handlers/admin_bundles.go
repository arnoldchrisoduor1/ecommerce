package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminBundle struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	Description *string           `json:"description,omitempty"`
	BasePrice   float64           `json:"base_price"`
	SalePrice   *float64          `json:"sale_price,omitempty"`
	Status      string            `json:"status"`
	Components  []bundleComponent `json:"components"`
}

type bundleComponentInput struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type adminBundleInput struct {
	Name        string                 `json:"name"`
	Slug        string                 `json:"slug"`
	Description *string                `json:"description"`
	BasePrice   float64                `json:"base_price"`
	SalePrice   *float64               `json:"sale_price"`
	Status      string                 `json:"status"`
	Components  []bundleComponentInput `json:"components"`
}

func (h *Handler) loadAdminBundle(c *fiber.Ctx, bundleID string) (*adminBundle, error) {
	var b adminBundle
	err := h.db.QueryRow(c.Context(), `
		SELECT id, name, slug, description, base_price, sale_price, status
		FROM products WHERE id = $1 AND is_bundle = true`, bundleID,
	).Scan(&b.ID, &b.Name, &b.Slug, &b.Description, &b.BasePrice, &b.SalePrice, &b.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, bi.quantity
		FROM bundle_items bi
		JOIN products p ON p.id = bi.component_product_id
		WHERE bi.bundle_product_id = $1
		ORDER BY bi.id`, bundleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	b.Components = make([]bundleComponent, 0)
	for rows.Next() {
		var comp bundleComponent
		if err := rows.Scan(&comp.ProductID, &comp.Name, &comp.Slug, &comp.BasePrice, &comp.SalePrice, &comp.Quantity); err != nil {
			return nil, err
		}
		b.Components = append(b.Components, comp)
	}
	return &b, rows.Err()
}

func (h *Handler) replaceBundleItems(c *fiber.Ctx, tx pgx.Tx, bundleID string, components []bundleComponentInput) error {
	if _, err := tx.Exec(c.Context(), `DELETE FROM bundle_items WHERE bundle_product_id = $1`, bundleID); err != nil {
		return err
	}
	for _, comp := range components {
		if comp.ProductID == "" || comp.Quantity <= 0 {
			return errors.New("each component needs product_id and quantity > 0")
		}
		var isBundle bool
		if err := tx.QueryRow(c.Context(), `SELECT is_bundle FROM products WHERE id = $1`, comp.ProductID).Scan(&isBundle); err != nil {
			return err
		}
		if isBundle {
			return errors.New("bundle cannot contain another bundle")
		}
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO bundle_items (bundle_product_id, component_product_id, quantity)
			VALUES ($1, $2, $3)`, bundleID, comp.ProductID, comp.Quantity); err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) AdminListBundles(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, slug, description, base_price, sale_price, status
		FROM products WHERE is_bundle = true ORDER BY updated_at DESC`)
	if err != nil {
		return internalError(c, "AdminListBundles query", err)
	}
	defer rows.Close()

	bundles := make([]adminBundle, 0)
	for rows.Next() {
		var b adminBundle
		if err := rows.Scan(&b.ID, &b.Name, &b.Slug, &b.Description, &b.BasePrice, &b.SalePrice, &b.Status); err != nil {
			return internalError(c, "AdminListBundles scan", err)
		}
		b.Components = []bundleComponent{}
		bundles = append(bundles, b)
	}
	if err := rows.Err(); err != nil {
		return internalError(c, "AdminListBundles rows", err)
	}
	return c.JSON(fiber.Map{"bundles": bundles})
}

func (h *Handler) AdminCreateBundle(c *fiber.Ctx) error {
	var req adminBundleInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.Slug = normalizeSlug(req.Slug)
	if req.Name == "" || req.Slug == "" {
		return badRequest(c, "name and slug are required")
	}
	if len(req.Components) == 0 {
		return badRequest(c, "components are required")
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	if !validateProductStatus(status) {
		return badRequest(c, "invalid status")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminCreateBundle begin", err)
	}
	defer tx.Rollback(c.Context())

	var bundleID string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO products (name, slug, description, base_price, sale_price, is_bundle, status)
		VALUES ($1, $2, $3, $4, $5, true, $6)
		RETURNING id`,
		req.Name, req.Slug, req.Description, req.BasePrice, req.SalePrice, status,
	).Scan(&bundleID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminCreateBundle insert", err)
	}

	if err := h.replaceBundleItems(c, tx, bundleID, req.Components); err != nil {
		if strings.Contains(err.Error(), "product_id") || strings.Contains(err.Error(), "bundle cannot") {
			return badRequest(c, err.Error())
		}
		return internalError(c, "AdminCreateBundle items", err)
	}

	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminCreateBundle commit", err)
	}

	b, err := h.loadAdminBundle(c, bundleID)
	if err != nil {
		return internalError(c, "AdminCreateBundle load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(b)
}

func (h *Handler) AdminUpdateBundle(c *fiber.Ctx) error {
	bundleID := c.Params("id")
	var req adminBundleInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Name == "" {
		return badRequest(c, "name is required")
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	if !validateProductStatus(status) {
		return badRequest(c, "invalid status")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminUpdateBundle begin", err)
	}
	defer tx.Rollback(c.Context())

	tag, err := tx.Exec(c.Context(), `
		UPDATE products
		SET name = $1,
			slug = COALESCE(NULLIF($2, ''), slug),
			description = $3,
			base_price = $4,
			sale_price = $5,
			status = $6,
			updated_at = now()
		WHERE id = $7 AND is_bundle = true`,
		req.Name, normalizeSlug(req.Slug), req.Description, req.BasePrice, req.SalePrice, status, bundleID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminUpdateBundle update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "bundle not found")
	}

	if len(req.Components) > 0 {
		if err := h.replaceBundleItems(c, tx, bundleID, req.Components); err != nil {
			if strings.Contains(err.Error(), "product_id") || strings.Contains(err.Error(), "bundle cannot") {
				return badRequest(c, err.Error())
			}
			return internalError(c, "AdminUpdateBundle items", err)
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminUpdateBundle commit", err)
	}

	b, err := h.loadAdminBundle(c, bundleID)
	if err != nil {
		return internalError(c, "AdminUpdateBundle load", err)
	}
	return c.JSON(b)
}

func (h *Handler) AdminDeleteBundle(c *fiber.Ctx) error {
	bundleID := c.Params("id")
	tag, err := h.db.Exec(c.Context(), `DELETE FROM products WHERE id = $1 AND is_bundle = true`, bundleID)
	if err != nil {
		return internalError(c, "AdminDeleteBundle delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "bundle not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
