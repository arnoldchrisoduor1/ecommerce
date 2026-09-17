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

type presenceBatchRequest struct {
	ProductIDs []string `json:"product_ids"`
}

// PresenceBatchCount returns live viewer counts for many products in one round trip.
func (h *Handler) PresenceBatchCount(c *fiber.Ctx) error {
	var req presenceBatchRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if len(req.ProductIDs) == 0 {
		return c.JSON(fiber.Map{"counts": fiber.Map{}})
	}
	if len(req.ProductIDs) > 100 {
		return badRequest(c, "too many product ids (max 100)")
	}

	ttl := presenceTTL()
	cutoff := strconv.FormatFloat(float64(time.Now().Add(-ttl).UnixMilli()), 'f', 0, 64)
	ctx := c.Context()
	pipe := h.rdb.Pipeline()
	type cmdPair struct {
		id   string
		zcard *redis.IntCmd
	}
	pairs := make([]cmdPair, 0, len(req.ProductIDs))
	for _, id := range req.ProductIDs {
		if id == "" {
			continue
		}
		key := presenceKey(id)
		pipe.ZRemRangeByScore(ctx, key, "-inf", cutoff)
		zcard := pipe.ZCard(ctx, key)
		pairs = append(pairs, cmdPair{id: id, zcard: zcard})
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return internalError(c, "PresenceBatchCount pipeline", err)
	}

	counts := make(map[string]int64, len(pairs))
	for _, p := range pairs {
		n, err := p.zcard.Result()
		if err != nil {
			return internalError(c, "PresenceBatchCount zcard", err)
		}
		counts[p.id] = n
	}
	return c.JSON(fiber.Map{"counts": counts})
}
