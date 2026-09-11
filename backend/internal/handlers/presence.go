package handlers

import (
	"os"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type presenceHeartbeatRequest struct {
	SessionID string `json:"session_id"`
}

func presenceTTL() time.Duration {
	if v := os.Getenv("PRESENCE_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return 60 * time.Second
}

func presenceKey(productID string) string {
	return "presence:product:" + productID
}

// PresenceHeartbeat records a viewer session for a product in Redis.
func (h *Handler) PresenceHeartbeat(c *fiber.Ctx) error {
	productID := c.Params("id")
	var req presenceHeartbeatRequest
	if err := c.BodyParser(&req); err != nil && len(c.Body()) > 0 {
		return badRequest(c, "invalid request body")
	}
	if req.SessionID == "" {
		req.SessionID = uuid.NewString()
	}

	var exists bool
	if err := h.db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1 AND status = 'active')`, productID).Scan(&exists); err != nil {
		return internalError(c, "PresenceHeartbeat check product", err)
	}
	if !exists {
		return notFound(c, "product not found")
	}

	score := float64(time.Now().UnixMilli())
	if err := h.rdb.ZAdd(c.Context(), presenceKey(productID), redis.Z{Score: score, Member: req.SessionID}).Err(); err != nil {
		return internalError(c, "PresenceHeartbeat zadd", err)
	}

	return c.JSON(fiber.Map{"session_id": req.SessionID})
}

// PresenceCount returns live viewer count after expiring stale sessions.
func (h *Handler) PresenceCount(c *fiber.Ctx) error {
	productID := c.Params("id")
	key := presenceKey(productID)
	ttl := presenceTTL()
	cutoff := float64(time.Now().Add(-ttl).UnixMilli())

	if err := h.rdb.ZRemRangeByScore(c.Context(), key, "-inf", strconv.FormatFloat(cutoff, 'f', 0, 64)).Err(); err != nil {
		return internalError(c, "PresenceCount expire", err)
	}

	count, err := h.rdb.ZCard(c.Context(), key).Result()
	if err != nil {
		return internalError(c, "PresenceCount zcard", err)
	}

	return c.JSON(fiber.Map{
		"product_id": productID,
		"count":      count,
	})
}
