package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"ecommerce-backend/internal/auth"
)

type adminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AdminLogin issues a JWT for env-configured admin credentials.
// V1 schema has no admin_users table — single admin via env is intentional.
func (h *Handler) AdminLogin(c *fiber.Ctx) error {
	var req adminLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}

	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		return badRequest(c, "email and password are required")
	}

	cfg, err := auth.LoadAdminConfig()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "admin auth not configured",
		})
	}

	if !auth.ValidateAdminCredentials(cfg, req.Email, req.Password) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	token, expiresAt, err := auth.IssueAdminToken(cfg)
	if err != nil {
		return internalError(c, "AdminLogin issue token", err)
	}

	return c.JSON(fiber.Map{
		"token":      token,
		"expires_at": expiresAt,
		"token_type": "Bearer",
	})
}
