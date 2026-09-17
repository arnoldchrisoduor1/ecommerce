package openrouter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	keyInfoEndpoint     = "https://openrouter.ai/api/v1/key"
	creditsEndpoint     = "https://openrouter.ai/api/v1/credits"
	redisKeyInfoKey     = "openrouter:key_info"
	redisCreditsKey     = "openrouter:credits"
	balanceCacheTTL     = 5 * time.Minute
	balanceHTTPTimeout  = 15 * time.Second
)

// KeyInfo is the OpenRouter key limit snapshot from GET /api/v1/key.
type KeyInfo struct {
	Label          string  `json:"label"`
	Limit          float64 `json:"limit"`
	LimitRemaining float64 `json:"limit_remaining"`
	Usage          float64 `json:"usage"`
	IsFreeTier     bool    `json:"is_free_tier"`
}

// CreditsInfo is account-wide credits from GET /api/v1/credits (management key).
type CreditsInfo struct {
	TotalCredits float64 `json:"total_credits"`
	TotalUsage   float64 `json:"total_usage"`
}

// FetchKeyInfo loads key limits from OpenRouter, optionally via Redis cache.
func FetchKeyInfo(ctx context.Context, rdb *redis.Client, forceRefresh bool) (*KeyInfo, error) {
	if rdb != nil && !forceRefresh {
		if cached, err := rdb.Get(ctx, redisKeyInfoKey).Bytes(); err == nil {
			var info KeyInfo
			if json.Unmarshal(cached, &info) == nil {
				return &info, nil
			}
		}
	}

	apiKey := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	if apiKey == "" {
		return nil, fmt.Errorf("OPENROUTER_API_KEY not set")
	}

	client := &http.Client{Timeout: balanceHTTPTimeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, keyInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter key status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var wrapper struct {
		Data KeyInfo `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}

	if rdb != nil {
		if b, err := json.Marshal(wrapper.Data); err == nil {
			_ = rdb.Set(ctx, redisKeyInfoKey, b, balanceCacheTTL).Err()
		}
	}
	return &wrapper.Data, nil
}

// FetchCredits loads account credits from OpenRouter management API.
func FetchCredits(ctx context.Context, rdb *redis.Client, forceRefresh bool) (*CreditsInfo, error) {
	if rdb != nil && !forceRefresh {
		if cached, err := rdb.Get(ctx, redisCreditsKey).Bytes(); err == nil {
			var info CreditsInfo
			if json.Unmarshal(cached, &info) == nil {
				return &info, nil
			}
		}
	}

	mgmtKey := strings.TrimSpace(os.Getenv("OPENROUTER_MANAGEMENT_KEY"))
	if mgmtKey == "" {
		return nil, fmt.Errorf("OPENROUTER_MANAGEMENT_KEY not set")
	}

	client := &http.Client{Timeout: balanceHTTPTimeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, creditsEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+mgmtKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter credits status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var wrapper struct {
		Data CreditsInfo `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}

	if rdb != nil {
		if b, err := json.Marshal(wrapper.Data); err == nil {
			_ = rdb.Set(ctx, redisCreditsKey, b, balanceCacheTTL).Err()
		}
	}
	return &wrapper.Data, nil
}
