package handlers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type stylistChatRequest struct {
	Message string `json:"message"`
}

type styleQuizRequest struct {
	SessionID string         `json:"session_id"`
	Answers   map[string]any `json:"answers"`
}

func anthropicAPIKey() (string, error) {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		return "", fmt.Errorf("ANTHROPIC_API_KEY not set")
	}
	return key, nil
}

func anthropicModel() string {
	if m := os.Getenv("ANTHROPIC_MODEL"); m != "" {
		return m
	}
	return "claude-sonnet-4-20250514"
}

func (h *Handler) loadProductCatalogContext(c *fiber.Ctx) (string, error) {
	rows, err := h.db.Query(c.Context(), `
		SELECT p.name, p.slug, COALESCE(p.sale_price, p.base_price)::float8,
			COALESCE(p.material, ''), COALESCE(p.description, '')
		FROM products p
		WHERE p.status = 'active' AND p.is_bundle = false
		ORDER BY p.created_at DESC
		LIMIT 40`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var b strings.Builder
	b.WriteString("Active catalog (name | slug | price KES | material | description snippet):\n")
	for rows.Next() {
		var name, slug, material, desc string
		var price float64
		if err := rows.Scan(&name, &slug, &price, &material, &desc); err != nil {
			return "", err
		}
		if len(desc) > 120 {
			desc = desc[:120] + "..."
		}
		fmt.Fprintf(&b, "- %s | %s | %.2f | %s | %s\n", name, slug, price, material, desc)
	}
	return b.String(), rows.Err()
}

// StylistChat streams a catalog-grounded styling answer from Claude.
func (h *Handler) StylistChat(c *fiber.Ctx) error {
	var req stylistChatRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if strings.TrimSpace(req.Message) == "" {
		return badRequest(c, "message is required")
	}

	apiKey, err := anthropicAPIKey()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "stylist not configured"})
	}

	catalog, err := h.loadProductCatalogContext(c)
	if err != nil {
		return internalError(c, "StylistChat catalog", err)
	}

	systemPrompt := "You are a fashion stylist for a women's basics storefront. Recommend ONLY products from the catalog below. Mention product names and slugs. Keep answers concise and actionable.\n\n" + catalog

	payload := map[string]any{
		"model":      anthropicModel(),
		"max_tokens": 1024,
		"stream":     true,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": req.Message},
		},
	}
	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(c.Context(), http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return internalError(c, "StylistChat build request", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return internalError(c, "StylistChat anthropic request", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": string(b)})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var event struct {
				Type  string `json:"type"`
				Delta struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}
			if event.Type == "content_block_delta" && event.Delta.Text != "" {
				chunk, _ := json.Marshal(fiber.Map{"text": event.Delta.Text})
				fmt.Fprintf(w, "data: %s\n\n", chunk)
				_ = w.Flush()
			}
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
		_ = w.Flush()
	})
	return nil
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
