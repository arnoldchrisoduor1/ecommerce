package handlers

import (
	"encoding/json"
	"testing"

	"ecommerce-backend/internal/storage"
)

func TestRewriteContentBlockDataSlides(t *testing.T) {
	h := &Handler{store: &storage.Client{}}
	// PublicURL via zero Client may still normalize — set via constructor fields if needed.
	// Use normalize-only path: store nil expands via NormalizeObjectKey.
	h.store = nil

	in := json.RawMessage(`{
		"media_url":"cms/hero/a.jpg",
		"media_urls":["cms/hero/a.jpg"],
		"slides":[{"url":"cms/hero/a.jpg","focal_x":0.2,"focal_y":0.8}]
	}`)
	out := h.rewriteContentBlockData(in)
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	slides, ok := m["slides"].([]any)
	if !ok || len(slides) != 1 {
		t.Fatalf("slides=%v", m["slides"])
	}
	slide := slides[0].(map[string]any)
	if slide["url"] != "cms/hero/a.jpg" && slide["url"] != storage.NormalizeObjectKey("cms/hero/a.jpg") {
		// with nil store, expandMedia returns NormalizeObjectKey
		got := slide["url"]
		want := storage.NormalizeObjectKey("cms/hero/a.jpg")
		if got != want {
			t.Fatalf("url=%v want %v", got, want)
		}
	}
	if slide["focal_x"].(float64) != 0.2 {
		t.Fatalf("focal_x=%v", slide["focal_x"])
	}
}

func TestNormalizeContentBlockDataSlides(t *testing.T) {
	h := &Handler{}
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "strip absolute slide url",
			in:   `{"slides":[{"url":"http://localhost:9000/ecommerce/cms/hero/x.jpg","focal_x":0.5,"focal_y":0.5}]}`,
			want: "cms/hero/x.jpg",
		},
		{
			name: "keep relative key",
			in:   `{"slides":[{"url":"cms/hero/y.jpg","focal_x":0.1,"focal_y":0.9}]}`,
			want: "cms/hero/y.jpg",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := h.normalizeContentBlockData(json.RawMessage(tc.in))
			var m map[string]any
			if err := json.Unmarshal(out, &m); err != nil {
				t.Fatal(err)
			}
			slides := m["slides"].([]any)
			slide := slides[0].(map[string]any)
			if slide["url"] != tc.want {
				t.Fatalf("url=%q want %q", slide["url"], tc.want)
			}
		})
	}
}
