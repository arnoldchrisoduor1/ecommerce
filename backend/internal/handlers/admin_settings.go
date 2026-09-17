package handlers

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"ecommerce-backend/internal/auth"
)

const adminCredentialsID = 1

// EnsureAdminCredentials seeds the singleton admin row from env on first deploy.
// Uses ADMIN_DEFAULT_PASSWORD when set, otherwise ADMIN_PASSWORD.
func (h *Handler) EnsureAdminCredentials(ctx context.Context) error {
	var exists bool
	if err := h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_credentials WHERE id = $1)`, adminCredentialsID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	email := strings.TrimSpace(os.Getenv("ADMIN_EMAIL"))
	pwd := strings.TrimSpace(os.Getenv("ADMIN_DEFAULT_PASSWORD"))
	if pwd == "" {
		pwd = strings.TrimSpace(os.Getenv("ADMIN_PASSWORD"))
	}
	if email == "" || pwd == "" {
		return nil
	}

	hash, err := auth.HashPassword(pwd)
	if err != nil {
		return err
	}
	_, err = h.db.Exec(ctx, `
		INSERT INTO admin_credentials (id, email, password_hash)
		VALUES ($1, $2, $3)`, adminCredentialsID, strings.ToLower(email), hash)
	return err
}

func (h *Handler) adminCredentialEmail(ctx context.Context) (string, error) {
	var email string
	err := h.db.QueryRow(ctx, `SELECT email FROM admin_credentials WHERE id = $1`, adminCredentialsID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		email = strings.TrimSpace(os.Getenv("ADMIN_EMAIL"))
		if email == "" {
			return "", errors.New("admin email not configured")
		}
		return strings.ToLower(email), nil
	}
	return email, err
}

func (h *Handler) validateAdminPassword(ctx context.Context, email, password string) (bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var hash string
	err := h.db.QueryRow(ctx, `
		SELECT password_hash FROM admin_credentials WHERE id = $1 AND lower(email) = $2`,
		adminCredentialsID, email,
	).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		cfg, cfgErr := auth.LoadAdminConfig()
		if cfgErr != nil {
			return false, cfgErr
		}
		return auth.ValidateAdminCredentials(cfg, email, password), nil
	}
	if err != nil {
		return false, err
	}
	return auth.CheckPassword(hash, password), nil
}

// AdminGetSettings returns non-secret admin account info.
func (h *Handler) AdminGetSettings(c *fiber.Ctx) error {
	email, err := h.adminCredentialEmail(c.Context())
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "admin not configured"})
	}
	var hasStored bool
	_ = h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM admin_credentials WHERE id = $1)`, adminCredentialsID).Scan(&hasStored)
	return c.JSON(fiber.Map{
		"email":            email,
		"password_stored":  hasStored,
		"password_change_requires_2fa": true,
	})
}

// AdminRequestPasswordChangeCode emails a 2FA code to the admin address.
func (h *Handler) AdminRequestPasswordChangeCode(c *fiber.Ctx) error {
	email, err := h.adminCredentialEmail(c.Context())
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "admin not configured"})
	}

	code, err := auth.GenerateDigitCode(5)
	if err != nil {
		return internalError(c, "AdminRequestPasswordChangeCode generate", err)
	}
	hash := auth.HashCode(code)
	expires := time.Now().UTC().Add(auth.VerificationTTL)
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO admin_verification_codes (email, code_hash, purpose, expires_at)
		VALUES ($1, $2, 'password_change', $3)`, email, hash, expires)
	if err != nil {
		return internalError(c, "AdminRequestPasswordChangeCode insert", err)
	}

	if err := h.mail.SendAdminPasswordChangeCode(c.Context(), email, code); err != nil {
		return internalError(c, "AdminRequestPasswordChangeCode mail", err)
	}
	return c.JSON(fiber.Map{"ok": true, "sent_to": email})
}

type adminChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	Code            string `json:"code"`
}

// AdminChangePassword updates the stored admin password after 2FA verification.
func (h *Handler) AdminChangePassword(c *fiber.Ctx) error {
	var req adminChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	current := strings.TrimSpace(req.CurrentPassword)
	next := strings.TrimSpace(req.NewPassword)
	code := strings.TrimSpace(req.Code)
	if current == "" || next == "" || code == "" {
		return badRequest(c, "current_password, new_password, and code are required")
	}
	if len(next) < 8 {
		return badRequest(c, "new password must be at least 8 characters")
	}

	email, err := h.adminCredentialEmail(c.Context())
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "admin not configured"})
	}

	ok, err := h.validateAdminPassword(c.Context(), email, current)
	if err != nil {
		return internalError(c, "AdminChangePassword validate current", err)
	}
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "current password is incorrect"})
	}

	if ok, err := h.consumeAdminVerificationCode(c.Context(), email, "password_change", code); err != nil {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": err.Error()})
	} else if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired verification code"})
	}

	newHash, err := auth.HashPassword(next)
	if err != nil {
		return internalError(c, "AdminChangePassword hash", err)
	}

	tag, err := h.db.Exec(c.Context(), `
		INSERT INTO admin_credentials (id, email, password_hash, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (id) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			email = EXCLUDED.email,
			updated_at = now()`, adminCredentialsID, email, newHash)
	if err != nil {
		return internalError(c, "AdminChangePassword upsert", err)
	}
	if tag.RowsAffected() == 0 {
		return internalError(c, "AdminChangePassword upsert", errors.New("no rows"))
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) consumeAdminVerificationCode(ctx context.Context, email, purpose, code string) (bool, error) {
	var id string
	var attempts int
	var expiresAt time.Time
	var consumedAt *time.Time
	var hash string
	err := h.db.QueryRow(ctx, `
		SELECT id, code_hash, attempts, expires_at, consumed_at
		FROM admin_verification_codes
		WHERE lower(email) = $1 AND purpose = $2
		ORDER BY created_at DESC LIMIT 1`, strings.ToLower(email), purpose,
	).Scan(&id, &hash, &attempts, &expiresAt, &consumedAt)
	if err != nil {
		return false, nil
	}
	if consumedAt != nil {
		return false, nil
	}
	if attempts >= auth.MaxCodeAttempts {
		return false, errors.New("too many incorrect attempts")
	}
	if time.Now().UTC().After(expiresAt) {
		return false, nil
	}
	if auth.HashCode(code) != hash {
		_, _ = h.db.Exec(ctx, `UPDATE admin_verification_codes SET attempts = attempts + 1 WHERE id = $1`, id)
		if attempts+1 >= auth.MaxCodeAttempts {
			return false, errors.New("too many incorrect attempts")
		}
		return false, nil
	}
	_, err = h.db.Exec(ctx, `UPDATE admin_verification_codes SET consumed_at = now() WHERE id = $1`, id)
	return err == nil, err
}
