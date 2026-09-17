package handlers

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestStylistStatus(t *testing.T) {
	cases := []struct {
		name       string
		key        string
		mock       string
		wantConfig bool
	}{
		{"missing key no mock", "", "false", false},
		{"set key", "sk-or-test-key", "false", true},
		{"mock without key", "", "true", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			prevKey, hadKey := os.LookupEnv("OPENROUTER_API_KEY")
			prevMock, hadMock := os.LookupEnv("AI_STYLIST_MOCK_MODE")
			prevModel, hadModel := os.LookupEnv("OPENROUTER_MODEL")

			if tc.key == "" {
				_ = os.Unsetenv("OPENROUTER_API_KEY")
			} else {
				t.Setenv("OPENROUTER_API_KEY", tc.key)
			}
			t.Setenv("AI_STYLIST_MOCK_MODE", tc.mock)
			_ = os.Unsetenv("OPENROUTER_MODEL")

			t.Cleanup(func() {
				if hadKey {
					_ = os.Setenv("OPENROUTER_API_KEY", prevKey)
				} else {
					_ = os.Unsetenv("OPENROUTER_API_KEY")
				}
				if hadMock {
					_ = os.Setenv("AI_STYLIST_MOCK_MODE", prevMock)
				} else {
					_ = os.Unsetenv("AI_STYLIST_MOCK_MODE")
				}
				if hadModel {
					_ = os.Setenv("OPENROUTER_MODEL", prevModel)
				} else {
					_ = os.Unsetenv("OPENROUTER_MODEL")
				}
			})

			app := fiber.New()
			h := &Handler{}
			app.Get("/api/stylist/status", h.StylistStatus)

			req := httptest.NewRequest(fiber.MethodGet, "/api/stylist/status", nil)
			res, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != fiber.StatusOK {
				t.Fatalf("status=%d", res.StatusCode)
			}
			var body struct {
				Configured bool `json:"configured"`
			}
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body.Configured != tc.wantConfig {
				t.Fatalf("configured=%v want %v", body.Configured, tc.wantConfig)
			}
		})
	}
}
