package handlers

import (
	"encoding/json"

	"ecommerce-backend/internal/storage"
)

func (h *Handler) expandMedia(stored string) string {
	if stored == "" {
		return ""
	}
	if h.store != nil {
		return h.store.PublicURL(stored)
	}
	return storage.NormalizeObjectKey(stored)
}

func (h *Handler) expandMediaPtr(p *string) *string {
	if p == nil {
		return nil
	}
	u := h.expandMedia(*p)
	return &u
}

func (h *Handler) normalizeMedia(stored string) string {
	return storage.NormalizeObjectKey(stored)
}

func (h *Handler) normalizeMediaPtr(p *string) *string {
	if p == nil {
		return nil
	}
	k := h.normalizeMedia(*p)
	return &k
}

func (h *Handler) expandProductImage(img *productImage) {
	if img == nil {
		return
	}
	img.URL = h.expandMedia(img.URL)
}

func (h *Handler) expandProductImages(imgs []productImage) {
	for i := range imgs {
		h.expandProductImage(&imgs[i])
	}
}

func (h *Handler) expandPrimaryImageMap(m map[string]*productImage) {
	for _, img := range m {
		h.expandProductImage(img)
	}
}

// rewriteContentBlockData expands media_url / media_urls / slides[].url for API responses.
func (h *Handler) rewriteContentBlockData(data json.RawMessage) json.RawMessage {
	if len(data) == 0 {
		return data
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return data
	}
	changed := false
	if v, ok := m["media_url"].(string); ok {
		m["media_url"] = h.expandMedia(v)
		changed = true
	}
	if arr, ok := m["media_urls"].([]any); ok {
		for i, x := range arr {
			if s, ok := x.(string); ok {
				arr[i] = h.expandMedia(s)
				changed = true
			}
		}
		m["media_urls"] = arr
	}
	if slides, ok := m["slides"].([]any); ok {
		for _, item := range slides {
			obj, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if u, ok := obj["url"].(string); ok {
				obj["url"] = h.expandMedia(u)
				changed = true
			}
		}
		m["slides"] = slides
	}
	if !changed {
		return data
	}
	out, err := json.Marshal(m)
	if err != nil {
		return data
	}
	return out
}

// normalizeContentBlockData stores bare keys for media fields.
func (h *Handler) normalizeContentBlockData(data json.RawMessage) json.RawMessage {
	if len(data) == 0 {
		return data
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return data
	}
	changed := false
	if v, ok := m["media_url"].(string); ok {
		m["media_url"] = h.normalizeMedia(v)
		changed = true
	}
	if arr, ok := m["media_urls"].([]any); ok {
		for i, x := range arr {
			if s, ok := x.(string); ok {
				arr[i] = h.normalizeMedia(s)
				changed = true
			}
		}
		m["media_urls"] = arr
	}
	if slides, ok := m["slides"].([]any); ok {
		for _, item := range slides {
			obj, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if u, ok := obj["url"].(string); ok {
				obj["url"] = h.normalizeMedia(u)
				changed = true
			}
		}
		m["slides"] = slides
	}
	if !changed {
		return data
	}
	out, err := json.Marshal(m)
	if err != nil {
		return data
	}
	return out
}
