package handlers

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type adminDiscountInput struct {
	Code       string     `json:"code"`
	Type       string     `json:"type"`
	Value      float64    `json:"value"`
	MaxClaims  *int       `json:"max_claims"`
	ActiveFrom *time.Time `json:"active_from"`
	ActiveTo   *time.Time `json:"active_to"`
	IsActive   *bool      `json:"is_active"`
	Context    string     `json:"context"`
}

func validateDiscountType(t string) bool {
	return t == "percentage" || t == "fixed"
}

func validateDiscountContext(ctx string) bool {
	return ctx == "" || ctx == "general" || ctx == "exit_intent"
}

func (h *Handler) AdminListDiscounts(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT id, code, type, value, max_claims, active_from, active_to, is_active, context
		FROM discounts ORDER BY code`)
	if err != nil {
		return internalError(c, "AdminListDiscounts query", err)
	}
	defer rows.Close()

	discounts := make([]discountResponse, 0)
	for rows.Next() {
		var d discountResponse
		if err := rows.Scan(&d.ID, &d.Code, &d.Type, &d.Value, &d.MaxClaims, &d.ActiveFrom, &d.ActiveTo, &d.IsActive, &d.Context); err != nil {
			return internalError(c, "AdminListDiscounts scan", err)
		}
		discounts = append(discounts, d)
	}
	return c.JSON(fiber.Map{"discounts": discounts})
}

func (h *Handler) AdminCreateDiscount(c *fiber.Ctx) error {
	var req adminDiscountInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	if req.Code == "" || !validateDiscountType(req.Type) {
		return badRequest(c, "code and valid type (percentage|fixed) are required")
	}
	if req.Value <= 0 {
		return badRequest(c, "value must be > 0")
	}
	ctx := req.Context
	if ctx == "" {
		ctx = "general"
	}
	if !validateDiscountContext(ctx) {
		return badRequest(c, "invalid context")
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO discounts (code, type, value, max_claims, active_from, active_to, is_active, context)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		req.Code, req.Type, req.Value, req.MaxClaims, req.ActiveFrom, req.ActiveTo, isActive, ctx,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "code already exists")
		}
		return internalError(c, "AdminCreateDiscount insert", err)
	}

	d, err := h.fetchDiscountByID(c, id)
	if err != nil {
		return internalError(c, "AdminCreateDiscount load", err)
	}
	return c.Status(fiber.StatusCreated).JSON(d)
}

func (h *Handler) fetchDiscountByID(c *fiber.Ctx, id string) (*discountResponse, error) {
	var d discountResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT id, code, type, value, max_claims, active_from, active_to, is_active, context
		FROM discounts WHERE id = $1`, id,
	).Scan(&d.ID, &d.Code, &d.Type, &d.Value, &d.MaxClaims, &d.ActiveFrom, &d.ActiveTo, &d.IsActive, &d.Context)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	return &d, err
}

func (h *Handler) AdminUpdateDiscount(c *fiber.Ctx) error {
	id := c.Params("id")
	var req adminDiscountInput
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Type != "" && !validateDiscountType(req.Type) {
		return badRequest(c, "invalid type")
	}
	ctx := req.Context
	if ctx != "" && !validateDiscountContext(ctx) {
		return badRequest(c, "invalid context")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE discounts SET
			code = COALESCE(NULLIF($1, ''), code),
			type = COALESCE(NULLIF($2, ''), type),
			value = CASE WHEN $3 > 0 THEN $3 ELSE value END,
			max_claims = $4,
			active_from = $5,
			active_to = $6,
			is_active = COALESCE($7, is_active),
			context = COALESCE(NULLIF($8, ''), context)
		WHERE id = $9`,
		strings.ToUpper(strings.TrimSpace(req.Code)), req.Type, req.Value,
		req.MaxClaims, req.ActiveFrom, req.ActiveTo, req.IsActive, ctx, id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return badRequest(c, "code already exists")
		}
		return internalError(c, "AdminUpdateDiscount update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "discount not found")
	}

	d, err := h.fetchDiscountByID(c, id)
	if err != nil {
		return internalError(c, "AdminUpdateDiscount load", err)
	}
	return c.JSON(d)
}

func (h *Handler) AdminDeleteDiscount(c *fiber.Ctx) error {
	id := c.Params("id")
	tag, err := h.db.Exec(c.Context(), `DELETE FROM discounts WHERE id = $1`, id)
	if err != nil {
		return internalError(c, "AdminDeleteDiscount delete", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "discount not found")
	}
	return c.SendStatus(fiber.StatusNoContent)
}
