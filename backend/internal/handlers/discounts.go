package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type discountResponse struct {
	ID          string     `json:"id"`
	Code        string     `json:"code"`
	Type        string     `json:"type"`
	Value       float64    `json:"value"`
	MaxClaims   *int       `json:"max_claims,omitempty"`
	ActiveFrom  *time.Time `json:"active_from,omitempty"`
	ActiveTo    *time.Time `json:"active_to,omitempty"`
	IsActive    bool       `json:"is_active"`
	Context     string     `json:"context"`
}

type claimDiscountRequest struct {
	SessionID  *string `json:"session_id"`
	CustomerID *string `json:"customer_id"`
}

func (h *Handler) fetchDiscountByCode(c *fiber.Ctx, code string) (*discountResponse, error) {
	var d discountResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT id, code, type, value, max_claims, active_from, active_to, is_active, context
		FROM discounts WHERE code = $1`, code,
	).Scan(&d.ID, &d.Code, &d.Type, &d.Value, &d.MaxClaims, &d.ActiveFrom, &d.ActiveTo, &d.IsActive, &d.Context)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func discountIsClaimable(d *discountResponse, now time.Time) (bool, string) {
	if !d.IsActive {
		return false, "discount is not active"
	}
	if d.ActiveFrom != nil && now.Before(*d.ActiveFrom) {
		return false, "discount is not yet active"
	}
	if d.ActiveTo != nil && now.After(*d.ActiveTo) {
		return false, "discount has expired"
	}
	return true, ""
}

// GetDiscount returns discount details for a promo code.
func (h *Handler) GetDiscount(c *fiber.Ctx) error {
	code := c.Params("code")
	d, err := h.fetchDiscountByCode(c, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "discount not found")
	}
	if err != nil {
		return internalError(c, "GetDiscount query", err)
	}
	return c.JSON(d)
}

// ClaimDiscount records a discount claim after validating eligibility.
func (h *Handler) ClaimDiscount(c *fiber.Ctx) error {
	code := c.Params("code")

	var req claimDiscountRequest
	if err := c.BodyParser(&req); err != nil && len(c.Body()) > 0 {
		return badRequest(c, "invalid request body")
	}
	if req.SessionID == nil && req.CustomerID == nil {
		return badRequest(c, "session_id or customer_id is required")
	}

	d, err := h.fetchDiscountByCode(c, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "discount not found")
	}
	if err != nil {
		return internalError(c, "ClaimDiscount query discount", err)
	}

	now := time.Now()
	if ok, msg := discountIsClaimable(d, now); !ok {
		return badRequest(c, msg)
	}

	if d.MaxClaims != nil {
		var totalClaims int
		err := h.db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM discount_claims WHERE discount_id = $1`, d.ID,
		).Scan(&totalClaims)
		if err != nil {
			return internalError(c, "ClaimDiscount count claims", err)
		}
		if totalClaims >= *d.MaxClaims {
			return badRequest(c, "discount has reached maximum claims")
		}
	}

	var claimID string
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO discount_claims (discount_id, customer_id, session_id)
		VALUES ($1, $2, $3)
		RETURNING id`, d.ID, req.CustomerID, req.SessionID,
	).Scan(&claimID)
	if err != nil {
		return internalError(c, "ClaimDiscount insert", err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"claim_id":    claimID,
		"discount_id": d.ID,
		"code":        d.Code,
	})
}

// DiscountClaimsToday returns how many claims were recorded today for a code.
func (h *Handler) DiscountClaimsToday(c *fiber.Ctx) error {
	code := c.Params("code")

	d, err := h.fetchDiscountByCode(c, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "discount not found")
	}
	if err != nil {
		return internalError(c, "DiscountClaimsToday query discount", err)
	}

	var count int
	err = h.db.QueryRow(c.Context(), `
		SELECT COUNT(*)
		FROM discount_claims
		WHERE discount_id = $1
		  AND claimed_at >= CURRENT_DATE`, d.ID,
	).Scan(&count)
	if err != nil {
		return internalError(c, "DiscountClaimsToday count", err)
	}

	return c.JSON(fiber.Map{
		"code":          d.Code,
		"claims_today":  count,
	})
}
