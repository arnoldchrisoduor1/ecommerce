package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"ecommerce-backend/internal/openrouter"
)

type stylistChatRequest struct {
	Message   string                   `json:"message"`
	SessionID string                   `json:"session_id"`
	History   []openrouter.ChatMessage `json:"history"`
}

type styleQuizRequest struct {
	SessionID string         `json:"session_id"`
	Answers   map[string]any `json:"answers"`
}

const stylistMaxTokens = 400

func stylistMockMode() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("AI_STYLIST_MOCK_MODE")), "true")
}

func stylistConfigured() bool {
	if stylistMockMode() {
		return true
	}
	key := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	if key == "" {
		return false
	}
	model := openrouter.ResolveModel(os.Getenv("OPENROUTER_MODEL"))
	return !openrouter.IsAnthropicModel(model)
}

// StylistStatus reports whether AI credentials are present (no secrets leaked).
func (h *Handler) StylistStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"configured": stylistConfigured(),
		"mock_mode":  stylistMockMode(),
	})
}

// StylistChat streams a catalog-grounded styling answer via OpenRouter.
func (h *Handler) StylistChat(c *fiber.Ctx) error {
	var req stylistChatRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if strings.TrimSpace(req.Message) == "" {
		return badRequest(c, "message is required")
	}

	if !stylistConfigured() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI not connected"})
	}
	if err := h.enforceAIAccess(c); err != nil {
		return err
	}

	storeContext, err := h.buildStylistContext(c, req.Message)
	if err != nil {
		return internalError(c, "StylistChat context", err)
	}
	systemPrompt := stylistSystemPrompt(storeContext)
	log.Printf("stylist system prompt (%d bytes): %s", len(systemPrompt), systemPrompt)

	const stylistHistoryBudget = 12
	history := trimStylistHistory(req.History, stylistHistoryBudget)
	if req.SessionID != "" && len(history) == 0 {
		history = h.loadStylistHistory(c.Context(), req.SessionID)
	}

	if stylistMockMode() {
		return h.streamMockStylist(c, req.Message, storeContext, history, req.SessionID)
	}

	client, err := openrouter.NewFromEnv()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "AI not connected"})
	}

	userID, _ := c.Locals(ctxUserIDKey).(string)
	sessionID := req.SessionID
	reqCtx := c.Context()

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		var full strings.Builder
		usage, err := client.StreamChatHistory(reqCtx, systemPrompt, history, req.Message, stylistMaxTokens, func(text string) error {
			full.WriteString(text)
			chunk, _ := json.Marshal(fiber.Map{"text": text})
			if _, err := fmt.Fprintf(w, "data: %s\n\n", chunk); err != nil {
				return err
			}
			return w.Flush()
		})
		if err != nil {
			log.Printf("stylist openrouter error: %v", err)
			errChunk, _ := json.Marshal(fiber.Map{"error": "AI not connected"})
			fmt.Fprintf(w, "data: %s\n\n", errChunk)
			fmt.Fprintf(w, "data: [DONE]\n\n")
			_ = w.Flush()
			return
		}
		cost := 0.0
		prompt, completion := 0, 0
		if usage != nil {
			prompt = usage.PromptTokens
			completion = usage.CompletionTokens
			cost = usage.Cost
		}
		h.logAIUsage(reqCtx, userID, sessionID, "stylist", client.Model(), prompt, completion, cost)
		if sessionID != "" {
			next := append(append([]openrouter.ChatMessage{}, history...),
				openrouter.ChatMessage{Role: "user", Content: req.Message},
				openrouter.ChatMessage{Role: "assistant", Content: full.String()},
			)
			h.saveStylistHistory(reqCtx, sessionID, trimStylistHistory(next, stylistHistoryBudget))
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
		_ = w.Flush()
	})
	return nil
}

func (h *Handler) streamMockStylist(c *fiber.Ctx, userMessage, storeContext string, history []openrouter.ChatMessage, sessionID string) error {
	reply := mockStylistReply(userMessage, storeContext)
	if len(history) > 0 {
		reply = "Following up on what we discussed — " + reply
	}
	log.Printf("stylist mock mode: zero API tokens used")

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		for _, word := range strings.Fields(reply) {
			chunk, _ := json.Marshal(fiber.Map{"text": word + " "})
			fmt.Fprintf(w, "data: %s\n\n", chunk)
			_ = w.Flush()
			time.Sleep(15 * time.Millisecond)
		}
		if sessionID != "" {
			next := append(append([]openrouter.ChatMessage{}, history...),
				openrouter.ChatMessage{Role: "user", Content: userMessage},
				openrouter.ChatMessage{Role: "assistant", Content: reply},
			)
			h.saveStylistHistory(c.Context(), sessionID, trimStylistHistory(next, 12))
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
		_ = w.Flush()
	})
	return nil
}

func stylistHistoryKey(sessionID string) string {
	return "stylist:history:" + sessionID
}

func trimStylistHistory(history []openrouter.ChatMessage, max int) []openrouter.ChatMessage {
	if max <= 0 || len(history) == 0 {
		return nil
	}
	out := make([]openrouter.ChatMessage, 0, len(history))
	for _, m := range history {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		content := strings.TrimSpace(m.Content)
		if (role != "user" && role != "assistant") || content == "" {
			continue
		}
		out = append(out, openrouter.ChatMessage{Role: role, Content: content})
	}
	if len(out) > max {
		out = out[len(out)-max:]
	}
	return out
}

func (h *Handler) loadStylistHistory(ctx context.Context, sessionID string) []openrouter.ChatMessage {
	if h.rdb == nil || sessionID == "" {
		return nil
	}
	raw, err := h.rdb.Get(ctx, stylistHistoryKey(sessionID)).Bytes()
	if err != nil || len(raw) == 0 {
		return nil
	}
	var msgs []openrouter.ChatMessage
	if err := json.Unmarshal(raw, &msgs); err != nil {
		return nil
	}
	return trimStylistHistory(msgs, 12)
}

func (h *Handler) saveStylistHistory(ctx context.Context, sessionID string, history []openrouter.ChatMessage) {
	if h.rdb == nil || sessionID == "" {
		return
	}
	b, err := json.Marshal(history)
	if err != nil {
		return
	}
	_ = h.rdb.Set(ctx, stylistHistoryKey(sessionID), b, 24*time.Hour).Err()
}

// SubmitStyleQuiz stores answers in Redis and returns matching product picks.
// No style_quiz table in V1 schema — Redis TTL storage is intentional.
func (h *Handler) SubmitStyleQuiz(c *fiber.Ctx) error {
	var req styleQuizRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.SessionID == "" {
		return badRequest(c, "session_id is required")
	}
	if len(req.Answers) == 0 {
		return badRequest(c, "answers are required")
	}

	answersJSON, err := json.Marshal(req.Answers)
	if err != nil {
		return internalError(c, "SubmitStyleQuiz marshal", err)
	}
	if err := h.rdb.Set(c.Context(), "style_quiz:"+req.SessionID, answersJSON, 7*24*time.Hour).Err(); err != nil {
		return internalError(c, "SubmitStyleQuiz redis", err)
	}

	maxPrice := 999999.0
	colorFilter := ""
	if budget, ok := req.Answers["budget"].(string); ok {
		switch budget {
		case "low":
			maxPrice = 1500
		case "mid":
			maxPrice = 3500
		case "high":
			maxPrice = 999999
		}
	}
	if vibe, ok := req.Answers["vibe"].(string); ok {
		switch vibe {
		case "minimal":
			colorFilter = "Black"
		case "bold":
			colorFilter = "Red"
		}
	}

	query := `
		SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.is_bundle, p.created_at
		FROM products p
		WHERE p.status = 'active' AND p.is_bundle = false
		  AND COALESCE(p.sale_price, p.base_price) <= $1`
	args := []any{maxPrice}
	if colorFilter != "" {
		args = append(args, colorFilter)
		query += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.color = $%d)", len(args))
	}
	query += " ORDER BY p.created_at DESC LIMIT 12"

	rows, err := h.db.Query(c.Context(), query, args...)
	if err != nil {
		return internalError(c, "SubmitStyleQuiz query", err)
	}
	defer rows.Close()

	products := make([]*productListItem, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var p productListItem
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.BasePrice, &p.SalePrice, &p.IsBundle, &p.CreatedAt); err != nil {
			return internalError(c, "SubmitStyleQuiz scan", err)
		}
		p.Variants = []variant{}
		products = append(products, &p)
		ids = append(ids, p.ID)
	}

	if len(ids) > 0 {
		images, err := h.fetchPrimaryImagesByProduct(c, ids)
		if err != nil {
			return internalError(c, "SubmitStyleQuiz images", err)
		}
		h.expandPrimaryImageMap(images)
		for _, p := range products {
			if img, ok := images[p.ID]; ok {
				p.PrimaryImage = img
			}
		}
	}

	return c.JSON(fiber.Map{
		"session_id": req.SessionID,
		"products":   products,
	})
}
