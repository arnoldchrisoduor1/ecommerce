package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type giftCardResponse struct {
	ID              string    `json:"id"`
	Code            string    `json:"code"`
	InitialBalance  float64   `json:"initial_balance"`
	Balance         float64   `json:"balance"`
	PurchaserEmail  *string   `json:"purchaser_email,omitempty"`
	PurchaserPhone  *string   `json:"purchaser_phone,omitempty"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
}

type purchaseGiftCardRequest struct {
	Amount float64 `json:"amount"`
	Email  *string `json:"email"`
	Phone  *string `json:"phone"`
}

type redeemGiftCardRequest struct {
	Code      string  `json:"code"`
	Amount    float64 `json:"amount"`
	OrderID   *string `json:"order_id"`
	SessionID *string `json:"session_id"`
}

func generateGiftCode() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "GC-" + strings.ToUpper(hex.EncodeToString(b)), nil
}

// PurchaseGiftCard creates an active gift card with a unique code.
func (h *Handler) PurchaseGiftCard(c *fiber.Ctx) error {
	var req purchaseGiftCardRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Amount < 100 {
		return badRequest(c, "amount must be at least 100")
	}

	code, err := generateGiftCode()
	if err != nil {
		return internalError(c, "PurchaseGiftCard code", err)
	}

	var g giftCardResponse
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO gift_cards (code, initial_balance, balance, purchaser_email, purchaser_phone, status)
		VALUES ($1, $2, $2, $3, $4, 'active')
		RETURNING id, code, initial_balance, balance, purchaser_email, purchaser_phone, status, created_at`,
		code, req.Amount, req.Email, req.Phone,
	).Scan(&g.ID, &g.Code, &g.InitialBalance, &g.Balance, &g.PurchaserEmail, &g.PurchaserPhone, &g.Status, &g.CreatedAt)
	if err != nil {
		return internalError(c, "PurchaseGiftCard insert", err)
	}
	return c.Status(fiber.StatusCreated).JSON(g)
}

// GetGiftCard looks up a card by code (balance check / redemption UI).
func (h *Handler) GetGiftCard(c *fiber.Ctx) error {
	code := strings.ToUpper(strings.TrimSpace(c.Params("code")))
	var g giftCardResponse
	err := h.db.QueryRow(c.Context(), `
		SELECT id, code, initial_balance, balance, purchaser_email, purchaser_phone, status, created_at
		FROM gift_cards WHERE upper(code) = $1`, code,
	).Scan(&g.ID, &g.Code, &g.InitialBalance, &g.Balance, &g.PurchaserEmail, &g.PurchaserPhone, &g.Status, &g.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "gift card not found")
	}
	if err != nil {
		return internalError(c, "GetGiftCard query", err)
	}
	return c.JSON(g)
}

// RedeemGiftCard deducts amount from balance (standalone redemption for UI demo).
func (h *Handler) RedeemGiftCard(c *fiber.Ctx) error {
	var req redeemGiftCardRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" || req.Amount <= 0 {
		return badRequest(c, "code and positive amount are required")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "RedeemGiftCard begin", err)
	}
	defer tx.Rollback(c.Context())

	var g giftCardResponse
	err = tx.QueryRow(c.Context(), `
		SELECT id, code, initial_balance, balance, purchaser_email, purchaser_phone, status, created_at
		FROM gift_cards WHERE upper(code) = $1 FOR UPDATE`, code,
	).Scan(&g.ID, &g.Code, &g.InitialBalance, &g.Balance, &g.PurchaserEmail, &g.PurchaserPhone, &g.Status, &g.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "gift card not found")
	}
	if err != nil {
		return internalError(c, "RedeemGiftCard load", err)
	}
	if g.Status != "active" {
		return badRequest(c, "gift card is not active")
	}
	if req.Amount > g.Balance {
		return badRequest(c, "amount exceeds balance")
	}

	newBal := g.Balance - req.Amount
	status := "active"
	if newBal == 0 {
		status = "depleted"
	}
	_, err = tx.Exec(c.Context(), `
		UPDATE gift_cards SET balance = $1, status = $2, updated_at = now() WHERE id = $3`,
		newBal, status, g.ID)
	if err != nil {
		return internalError(c, "RedeemGiftCard update", err)
	}

	var sessionID *string
	if req.SessionID != nil && *req.SessionID != "" {
		sessionID = req.SessionID
	}
	_, err = tx.Exec(c.Context(), `
		INSERT INTO gift_card_redemptions (gift_card_id, order_id, amount, session_id)
		VALUES ($1, $2, $3, $4)`, g.ID, req.OrderID, req.Amount, sessionID)
	if err != nil {
		return internalError(c, "RedeemGiftCard redemption", err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "RedeemGiftCard commit", err)
	}

	g.Balance = newBal
	g.Status = status
	return c.JSON(g)
}
