package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type newsletterSubscribeRequest struct {
	Email  string `json:"email"`
	Source string `json:"source"`
}

var allowedNewsletterSources = map[string]bool{
	"footer":   true,
	"modal":    true,
	"checkout": true,
}

func normalizeNewsletterEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validNewsletterEmail(email string) bool {
	if email == "" || len(email) > 255 {
		return false
	}
	at := strings.IndexByte(email, '@')
	if at < 1 || at == len(email)-1 {
		return false
	}
	dot := strings.LastIndexByte(email, '.')
	return dot > at+1 && dot < len(email)-1
}

// SubscribeNewsletter handles POST /api/newsletter/subscribe.
func (h *Handler) SubscribeNewsletter(c *fiber.Ctx) error {
	var req newsletterSubscribeRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	email := normalizeNewsletterEmail(req.Email)
	if !validNewsletterEmail(email) {
		return badRequest(c, "valid email is required")
	}
	source := strings.TrimSpace(strings.ToLower(req.Source))
	if source == "" {
		source = "footer"
	}
	if !allowedNewsletterSources[source] {
		return badRequest(c, "invalid source")
	}

	var id string
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO newsletter_subscribers (email, source, status)
		VALUES ($1, $2, 'subscribed')
		RETURNING id`, email, source).Scan(&id)
	if err == nil {
		h.emitActivity("newsletter_signup", nil, nil, nil, nil)
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"ok":     true,
			"status": "subscribed",
			"id":     id,
		})
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		var existingStatus string
		qErr := h.db.QueryRow(c.Context(), `
			SELECT status FROM newsletter_subscribers WHERE lower(email) = $1`, email).Scan(&existingStatus)
		if qErr != nil {
			return internalError(c, "SubscribeNewsletter lookup", qErr)
		}
		if existingStatus == "unsubscribed" {
			err = h.db.QueryRow(c.Context(), `
				UPDATE newsletter_subscribers
				SET status = 'subscribed',
				    source = $2,
				    unsubscribed_at = NULL,
				    updated_at = now()
				WHERE lower(email) = $1
				RETURNING id`, email, source).Scan(&id)
			if err != nil {
				return internalError(c, "SubscribeNewsletter resubscribe", err)
			}
			h.emitActivity("newsletter_signup", nil, nil, nil, nil)
			return c.JSON(fiber.Map{"ok": true, "status": "subscribed", "id": id})
		}
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"ok":     false,
			"status": "duplicate",
			"error":  "email already subscribed",
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return internalError(c, "SubscribeNewsletter insert", err)
	}
	return internalError(c, "SubscribeNewsletter insert", err)
}
