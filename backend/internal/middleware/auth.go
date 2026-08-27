package middleware

import (
	"sync"

	"github.com/gofiber/fiber/v2"

	"ecommerce-backend/internal/auth"
)

var (
	adminCfg     auth.AdminConfig
	adminCfgErr  error
	adminCfgOnce sync.Once
)

func loadAdminConfig() (auth.AdminConfig, error) {
	adminCfgOnce.Do(func() {
		adminCfg, adminCfgErr = auth.LoadAdminConfig()
	})
	return adminCfg, adminCfgErr
}

// RequireAdminAuth validates a Bearer JWT issued by POST /api/admin/login.
func RequireAdminAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		cfg, err := loadAdminConfig()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "admin auth not configured",
			})
		}

		token, err := auth.BearerToken(c.Get("Authorization"))
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}

		claims, err := auth.ParseAdminToken(cfg.JWTSecret, token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}

		c.Locals("admin_email", claims.Email)
		c.Locals("admin_role", claims.Role)
		return c.Next()
	}
}
