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
		wantConfig bool
	}{
		{"missing key", "", false},
		{"set key", "sk-test-key", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			prev, had := os.LookupEnv("ANTHROPIC_API_KEY")
			if tc.key == "" {
				_ = os.Unsetenv("ANTHROPIC_API_KEY")
			} else {
				t.Setenv("ANTHROPIC_API_KEY", tc.key)
			}
			t.Cleanup(func() {
				if had {
					_ = os.Setenv("ANTHROPIC_API_KEY", prev)
				} else {
					_ = os.Unsetenv("ANTHROPIC_API_KEY")
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
