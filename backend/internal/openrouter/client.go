package openrouter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	DefaultModel     = "qwen/qwen3-30b-a3b-instruct-2507"
	chatCompletions  = "https://openrouter.ai/api/v1/chat/completions"
	requestTimeout   = 20 * time.Second
)

// Usage holds token counts (and optional cost) from an OpenRouter response.
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	Cost             float64
}

// Client calls OpenRouter chat completions (streaming).
type Client struct {
	apiKey string
	model  string
	http   *http.Client
}

func NewFromEnv() (*Client, error) {
	key := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	if key == "" {
		return nil, fmt.Errorf("OPENROUTER_API_KEY not set")
	}
	model := ResolveModel(os.Getenv("OPENROUTER_MODEL"))
	return &Client{
		apiKey: key,
		model:  model,
		http:   &http.Client{Timeout: requestTimeout},
	}, nil
}

// ResolveModel returns env model or DefaultModel; rejects Anthropic/Claude slugs.
func ResolveModel(envModel string) string {
	m := strings.TrimSpace(envModel)
	if m == "" {
		return DefaultModel
	}
	if IsAnthropicModel(m) {
		return DefaultModel
	}
	return m
}

// IsAnthropicModel reports Claude/Anthropic model IDs (must never be used).
func IsAnthropicModel(model string) bool {
	lower := strings.ToLower(model)
	return strings.Contains(lower, "anthropic") || strings.Contains(lower, "claude")
}

func (c *Client) Model() string { return c.model }

// ChatMessage is one turn for multi-turn stylist conversations.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// StreamChat streams assistant text. Retries once on 5xx or transport timeout.
// history may include prior user/assistant turns; userMessage is the latest user turn.
func (c *Client) StreamChat(
	ctx context.Context,
	systemPrompt, userMessage string,
	maxTokens int,
	onChunk func(text string) error,
) (*Usage, error) {
	return c.StreamChatHistory(ctx, systemPrompt, nil, userMessage, maxTokens, onChunk)
}

// StreamChatHistory streams with prior conversation turns (user/assistant only).
func (c *Client) StreamChatHistory(
	ctx context.Context,
	systemPrompt string,
	history []ChatMessage,
	userMessage string,
	maxTokens int,
	onChunk func(text string) error,
) (*Usage, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(500 * time.Millisecond)
		}
		usage, err := c.streamOnce(ctx, systemPrompt, history, userMessage, maxTokens, onChunk)
		if err == nil {
			return usage, nil
		}
		lastErr = err
		if !retryable(err) {
			break
		}
	}
	return nil, lastErr
}

func retryable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "status 5") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "connection reset")
}

func (c *Client) streamOnce(
	ctx context.Context,
	systemPrompt string,
	history []ChatMessage,
	userMessage string,
	maxTokens int,
	onChunk func(text string) error,
) (*Usage, error) {
	msgs := make([]map[string]string, 0, len(history)+2)
	msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
	for _, m := range history {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		msgs = append(msgs, map[string]string{"role": role, "content": content})
	}
	msgs = append(msgs, map[string]string{"role": "user", "content": userMessage})

	payload := map[string]any{
		"model":    c.model,
		"messages": msgs,
		"max_tokens": maxTokens,
		"stream":     true,
		"stream_options": map[string]any{
			"include_usage": true,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, chatCompletions, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("HTTP-Referer", "https://ecommerce.local")
	req.Header.Set("X-Title", "Ecommerce Stylist")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openrouter request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openrouter status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var usage Usage
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
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int     `json:"prompt_tokens"`
				CompletionTokens int     `json:"completion_tokens"`
				Cost             float64 `json:"cost"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}
		if event.Usage != nil {
			usage.PromptTokens = event.Usage.PromptTokens
			usage.CompletionTokens = event.Usage.CompletionTokens
			usage.Cost = event.Usage.Cost
		}
		if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
			if err := onChunk(event.Choices[0].Delta.Content); err != nil {
				return &usage, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return &usage, err
	}
	return &usage, nil
}

// LogUsage writes per-request token counts to server logs.
func LogUsage(feature string, model string, u *Usage) {
	if u == nil {
		return
	}
	if u.Cost > 0 {
		log.Printf("openrouter %s model=%s prompt_tokens=%d completion_tokens=%d cost=%.6f",
			feature, model, u.PromptTokens, u.CompletionTokens, u.Cost)
		return
	}
	log.Printf("openrouter %s model=%s prompt_tokens=%d completion_tokens=%d total=%d",
		feature, model, u.PromptTokens, u.CompletionTokens, u.PromptTokens+u.CompletionTokens)
}
