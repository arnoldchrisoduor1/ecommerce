package handlers

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type adminCategoryRow struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	ParentID     *string `json:"parent_id,omitempty"`
	Position     int     `json:"position"`
	ProductCount int64   `json:"product_count"`
}

func categorySlugFromName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (h *Handler) AdminListCategories(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT c.id, c.name, c.slug, c.parent_id, c.position,
		       (SELECT COUNT(*)::bigint FROM products p WHERE p.category_id = c.id)
		FROM categories c
		ORDER BY c.position, c.name`)
	if err != nil {
		return internalError(c, "AdminListCategories query", err)
	}
	defer rows.Close()

	items := make([]adminCategoryRow, 0)
	for rows.Next() {
		var row adminCategoryRow
		if err := rows.Scan(&row.ID, &row.Name, &row.Slug, &row.ParentID, &row.Position, &row.ProductCount); err != nil {
			return internalError(c, "AdminListCategories scan", err)
		}
		items = append(items, row)
	}
	return c.JSON(fiber.Map{"categories": items})
}

type adminCategoryInput struct {
	Name     string  `json:"name"`
	Slug     *string `json:"slug"`
	ParentID *string `json:"parent_id"`
}

func (h *Handler) AdminCreateCategory(c *fiber.Ctx) error {
	var req adminCategoryInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return badRequest(c, "name is required")
	}
	slug := categorySlugFromName(name)
	if req.Slug != nil && strings.TrimSpace(*req.Slug) != "" {
		slug = normalizeSlug(*req.Slug)
	}
	if slug == "" {
		return badRequest(c, "slug is required")
	}

	var parentID *string
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		pid := strings.TrimSpace(*req.ParentID)
		parentID = &pid
		var exists bool
		if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1)`, pid).Scan(&exists); err != nil || !exists {
			return badRequest(c, "parent category not found")
		}
	}

	var position int
	if err := h.db.QueryRow(c.Context(), `SELECT COALESCE(MAX(position), 0) + 1 FROM categories`).Scan(&position); err != nil {
		return internalError(c, "AdminCreateCategory position", err)
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO categories (name, slug, parent_id, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id`, name, slug, parentID, position).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminCreateCategory insert", err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id, "slug": slug})
}

func (h *Handler) AdminUpdateCategory(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminCategoryInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return badRequest(c, "name is required")
	}
	slug := categorySlugFromName(name)
	if req.Slug != nil && strings.TrimSpace(*req.Slug) != "" {
		slug = normalizeSlug(*req.Slug)
	}
	if slug == "" {
		return badRequest(c, "slug is required")
	}

	var parentID *string
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		pid := strings.TrimSpace(*req.ParentID)
		if pid == id {
			return badRequest(c, "category cannot be its own parent")
		}
		parentID = &pid
		var exists bool
		if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1)`, pid).Scan(&exists); err != nil || !exists {
			return badRequest(c, "parent category not found")
		}
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE categories
		SET name = $1, slug = $2, parent_id = $3
		WHERE id = $4`, name, slug, parentID, id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return badRequest(c, "slug already exists")
		}
		return internalError(c, "AdminUpdateCategory update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "category not found")
	}
	return c.JSON(fiber.Map{"ok": true, "slug": slug})
}

func (h *Handler) AdminDeleteCategory(c *fiber.Ctx) error {
	id := c.Params("id")
	reassignTo := strings.TrimSpace(c.Query("reassign_to"))

	var productCount, childCount int64
	err := h.db.QueryRow(c.Context(), `
		SELECT
			(SELECT COUNT(*)::bigint FROM products WHERE category_id = $1),
			(SELECT COUNT(*)::bigint FROM categories WHERE parent_id = $1)`, id,
	).Scan(&productCount, &childCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c, "category not found")
		}
		return internalError(c, "AdminDeleteCategory counts", err)
	}

	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1)`, id).Scan(&exists); err != nil {
		return internalError(c, "AdminDeleteCategory exists", err)
	}
	if !exists {
		return notFound(c, "category not found")
	}

	if childCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":       "category has subcategories",
			"child_count": childCount,
		})
	}
	if productCount > 0 && reassignTo == "" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":         "category has products",
			"product_count": productCount,
			"hint":          "pass ?reassign_to=<category_id> to move products before delete",
		})
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminDeleteCategory begin", err)
	}
	defer tx.Rollback(c.Context())

	if productCount > 0 {
		if reassignTo == id {
			return badRequest(c, "reassign_to must differ from category being deleted")
		}
		var targetExists bool
		if err := tx.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1)`, reassignTo).Scan(&targetExists); err != nil {
			return internalError(c, "AdminDeleteCategory reassign lookup", err)
		}
		if !targetExists {
			return badRequest(c, "reassign target category not found")
		}
		if _, err := tx.Exec(c.Context(), `UPDATE products SET category_id = $1, updated_at = now() WHERE category_id = $2`, reassignTo, id); err != nil {
			return internalError(c, "AdminDeleteCategory reassign", err)
		}
	}

	tag, err := tx.Exec(c.Context(), `DELETE FROM categories WHERE id = $1`, id)
	if err != nil {
		return internalError(c, "AdminDeleteCategory delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "category not found")
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminDeleteCategory commit", err)
	}
	return c.JSON(fiber.Map{"ok": true, "reassigned_products": productCount})
}

type adminCategoryReorderInput struct {
	Order []string `json:"order"`
}

func (h *Handler) AdminReorderCategories(c *fiber.Ctx) error {
	var req adminCategoryReorderInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if len(req.Order) == 0 {
		return badRequest(c, "order is required")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AdminReorderCategories begin", err)
	}
	defer tx.Rollback(c.Context())

	for i, id := range req.Order {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		tag, err := tx.Exec(c.Context(), `UPDATE categories SET position = $1 WHERE id = $2`, i+1, id)
		if err != nil {
			return internalError(c, fmt.Sprintf("AdminReorderCategories update %d", i), err)
		}
		if tag.RowsAffected() == 0 {
			return badRequest(c, "unknown category id in order: "+id)
		}
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AdminReorderCategories commit", err)
	}
	return c.JSON(fiber.Map{"ok": true})
}
