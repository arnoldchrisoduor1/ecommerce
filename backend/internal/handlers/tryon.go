package handlers

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"ecommerce-backend/internal/openrouter"
)

type tryOnRequest struct {
	ProductID   string `json:"product_id"`
	PhotoBase64 string `json:"photo_base64"`
}

const maxTryOnPhotoBytes = 4 << 20 // 4 MiB decoded

// 1×1 PNG — mock try-on fixture (no user upload persisted).
const mockTryOnFixturePNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func tryOnMockMode() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("AI_TRYON_MOCK_MODE")), "true")
}

func tryOnConfigured() bool {
	if tryOnMockMode() {
		return true
	}
	return strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")) != ""
}

// TryOnStatus reports whether try-on AI is available.
func (h *Handler) TryOnStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"configured": tryOnConfigured(),
		"mock_mode":  tryOnMockMode(),
	})
}

// TryOnGenerate composites a garment onto a user photo via OpenRouter Image API.
// User photos exist only in memory for the request — never persisted to DB or object storage.
func (h *Handler) TryOnGenerate(c *fiber.Ctx) error {
	if !tryOnConfigured() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI try-on not connected"})
	}

	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	if err := h.enforceAIAccess(c); err != nil {
		return err
	}

	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return internalError(c, "TryOnGenerate user", err)
	}
	if !user.EmailVerified {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":                 "email verification required",
			"email_verified":        false,
			"two_factor_required":   false,
		})
	}
	if !user.TwoFactorEnabled {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":               "two_factor_required",
			"two_factor_required": true,
			"message":             "Two-step verification is required for this feature",
		})
	}

	var req tryOnRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if strings.TrimSpace(req.ProductID) == "" {
		return badRequest(c, "product_id is required")
	}
	photoRef, err := normalizeTryOnPhoto(req.PhotoBase64)
	if err != nil {
		return badRequest(c, err.Error())
	}

	var productName, imageKey string
	err = h.db.QueryRow(c.Context(), `
		SELECT p.name, COALESCE(
			(SELECT pi.url FROM product_images pi
			 WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1),
			''
		)
		FROM products p
		WHERE p.id = $1 AND p.status = 'active'`, req.ProductID,
	).Scan(&productName, &imageKey)
	if err == pgx.ErrNoRows {
		return notFound(c, "product not found")
	}
	if err != nil {
		return internalError(c, "TryOnGenerate product", err)
	}
	if imageKey == "" && !tryOnMockMode() {
		return badRequest(c, "product has no image for try-on")
	}

	garmentURL := imageKey
	if h.store != nil {
		garmentURL = h.store.PublicURL(imageKey)
	}
	prompt := fmt.Sprintf(
		"Virtual try-on for ecommerce: realistically dress the person in the reference photo with the %s garment shown in the product reference. Preserve the person's face, body pose, and background. Output a single photorealistic full-body or upper-body fashion photo.",
		productName,
	)

	if tryOnMockMode() {
		log.Printf("tryon mock mode: zero API tokens used product=%s", req.ProductID)
		// Fixture PNG only — user photo exists in memory for this request and is not stored.
		return c.JSON(fiber.Map{
			"image_data_url": mockTryOnFixturePNG,
			"mock":           true,
		})
	}

	apiKey := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	model := openrouter.TryOnModelFromEnv()

	b64, usage, err := openrouter.GenerateImage(
		c.Context(),
		apiKey,
		model,
		prompt,
		[]string{photoRef, garmentURL},
	)
	if err != nil {
		log.Printf("tryon openrouter error: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI try-on not connected"})
	}

	if usage != nil {
		h.logAIUsage(c.Context(), userID, "", "tryon", model,
			usage.PromptTokens, usage.CompletionTokens, usage.Cost)
	}

	return c.JSON(fiber.Map{
		"image_data_url": "data:image/png;base64," + b64,
	})
}

func normalizeTryOnPhoto(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("photo_base64 is required")
	}
	const prefix = "data:image/"
	if !strings.HasPrefix(raw, prefix) {
		return "", fmt.Errorf("photo must be a data URL image")
	}
	comma := strings.Index(raw, ",")
	if comma < 0 {
		return "", fmt.Errorf("invalid photo data URL")
	}
	meta := raw[:comma]
	if !strings.Contains(meta, "jpeg") && !strings.Contains(meta, "jpg") &&
		!strings.Contains(meta, "png") && !strings.Contains(meta, "webp") {
		return "", fmt.Errorf("photo must be jpeg, png, or webp")
	}
	decoded, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return "", fmt.Errorf("invalid photo encoding")
	}
	if len(decoded) > maxTryOnPhotoBytes {
		return "", fmt.Errorf("photo exceeds 4MB limit")
	}
	return raw, nil
}
