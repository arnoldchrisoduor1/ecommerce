package handlers

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"ecommerce-backend/internal/auth"
	"ecommerce-backend/internal/openrouter"
)

// Shown to customers when AI is blocked (global kill or per-user toggle).
const aiBlockedMessage = "AI features are currently unavailable for your account. Contact support if you believe this is a mistake."

func aiLowBalanceThreshold() float64 {
	raw := strings.TrimSpace(os.Getenv("AI_LOW_BALANCE_THRESHOLD"))
	if raw == "" {
		return 1.0
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v < 0 {
		return 1.0
	}
	return v
}

func envAIGloballyEnabled() bool {
	raw := strings.TrimSpace(os.Getenv("AI_FEATURES_GLOBALLY_ENABLED"))
	if raw == "" {
		return true
	}
	return !strings.EqualFold(raw, "false") && raw != "0"
}

// EnsureAISettings seeds the singleton ai_settings row from env on first deploy.
func (h *Handler) EnsureAISettings(ctx context.Context) error {
	var exists bool
	if err := h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ai_settings WHERE id = 1)`).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	enabled := envAIGloballyEnabled()
	_, err := h.db.Exec(ctx, `
		INSERT INTO ai_settings (id, features_globally_enabled)
		VALUES (1, $1)`, enabled)
	return err
}

func (h *Handler) isAIGloballyEnabled(ctx context.Context) (bool, error) {
	var enabled bool
	err := h.db.QueryRow(ctx, `
		SELECT features_globally_enabled FROM ai_settings WHERE id = 1`,
	).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return envAIGloballyEnabled(), nil
	}
	return enabled, err
}

// validAdminBearer reports whether Authorization carries a valid admin JWT.
// Used only for global-kill bypass — admins keep AI access while customers are blocked.
func (h *Handler) validAdminBearer(c *fiber.Ctx) bool {
	raw, err := auth.BearerToken(c.Get("Authorization"))
	if err != nil {
		return false
	}
	cfg, err := auth.LoadAdminConfig()
	if err != nil {
		return false
	}
	_, err = auth.ParseAdminToken(cfg.JWTSecret, raw)
	return err == nil
}

// enforceAIAccess blocks stylist/try-on before any OpenRouter call.
// Global kill switch bypasses admins (valid admin JWT) but NOT per-user ai_access_enabled.
func (h *Handler) enforceAIAccess(c *fiber.Ctx) error {
	userID, _ := c.Locals(ctxUserIDKey).(string)

	if userID != "" {
		var enabled bool
		err := h.db.QueryRow(c.Context(), `
			SELECT ai_access_enabled FROM users WHERE id = $1`, userID,
		).Scan(&enabled)
		if err == nil && !enabled {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "ai_unavailable",
				"message": aiBlockedMessage,
			})
		}
	}

	globalOn, err := h.isAIGloballyEnabled(c.Context())
	if err != nil {
		return internalError(c, "enforceAIAccess settings", err)
	}
	if !globalOn && !h.validAdminBearer(c) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":   "ai_unavailable",
			"message": aiBlockedMessage,
		})
	}
	return nil
}

func (h *Handler) logAIUsage(
	ctx context.Context,
	userID string,
	sessionID string,
	feature string,
	model string,
	promptTokens int,
	completionTokens int,
	estimatedCost float64,
) {
	var userPtr *string
	if strings.TrimSpace(userID) != "" {
		u := strings.TrimSpace(userID)
		userPtr = &u
	}
	var sessionPtr *string
	if strings.TrimSpace(sessionID) != "" {
		s := strings.TrimSpace(sessionID)
		if len(s) > 64 {
			s = s[:64]
		}
		sessionPtr = &s
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO ai_usage_log
			(user_id, session_id, feature, model, prompt_tokens, completion_tokens, estimated_cost)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userPtr, sessionPtr, feature, model, promptTokens, completionTokens, estimatedCost)
	if err != nil {
		openrouter.LogUsage(feature, model, &openrouter.Usage{
			PromptTokens:     promptTokens,
			CompletionTokens: completionTokens,
			Cost:             estimatedCost,
		})
	}
}
