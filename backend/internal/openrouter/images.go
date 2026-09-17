package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const imagesEndpoint = "https://openrouter.ai/api/v1/images"

// DefaultTryOnModel supports reference images for virtual try-on.
const DefaultTryOnModel = "bytedance-seed/seedream-4.5"

// ImageUsage holds token/cost data when returned by OpenRouter.
type ImageUsage struct {
	PromptTokens     int
	CompletionTokens int
	Cost             float64
}

// GenerateImage calls OpenRouter Image API with optional reference images.
func GenerateImage(
	ctx context.Context,
	apiKey, model, prompt string,
	inputReferences []string,
) (b64 string, usage *ImageUsage, err error) {
	if strings.TrimSpace(apiKey) == "" {
		return "", nil, fmt.Errorf("OPENROUTER_API_KEY not set")
	}
	m := strings.TrimSpace(model)
	if m == "" {
		m = DefaultTryOnModel
	}
	if IsAnthropicModel(m) {
		m = DefaultTryOnModel
	}

	payload := map[string]any{
		"model":  m,
		"prompt": prompt,
		"n":      1,
		"size":   "1K",
		"aspect_ratio": "3:4",
	}
	if len(inputReferences) > 0 {
		payload["input_references"] = inputReferences
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	client := &http.Client{Timeout: 90 * time.Second}
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(500 * time.Millisecond)
		}
		b64, usage, err = generateImageOnce(ctx, client, apiKey, body)
		if err == nil {
			return b64, usage, nil
		}
		lastErr = err
		if !retryable(err) {
			break
		}
	}
	return "", nil, lastErr
}

func generateImageOnce(ctx context.Context, client *http.Client, apiKey string, body []byte) (string, *ImageUsage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, imagesEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("HTTP-Referer", "https://ecommerce.local")
	req.Header.Set("X-Title", "Ecommerce Try-On")

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("openrouter images request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("openrouter images status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var out struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Usage *struct {
			PromptTokens     int     `json:"prompt_tokens"`
			CompletionTokens int     `json:"completion_tokens"`
			TotalTokens      int     `json:"total_tokens"`
			Cost             float64 `json:"cost"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", nil, err
	}
	if len(out.Data) == 0 || out.Data[0].B64JSON == "" {
		return "", nil, fmt.Errorf("openrouter images: empty response")
	}
	var usage *ImageUsage
	if out.Usage != nil {
		usage = &ImageUsage{
			PromptTokens:     out.Usage.PromptTokens,
			CompletionTokens: out.Usage.CompletionTokens,
			Cost:             out.Usage.Cost,
		}
	}
	return out.Data[0].B64JSON, usage, nil
}

func TryOnModelFromEnv() string {
	m := strings.TrimSpace(os.Getenv("OPENROUTER_TRYON_MODEL"))
	if m == "" {
		return DefaultTryOnModel
	}
	if IsAnthropicModel(m) {
		return DefaultTryOnModel
	}
	return m
}
