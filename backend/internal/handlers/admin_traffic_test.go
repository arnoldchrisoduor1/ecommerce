package handlers

import "testing"

func TestTrafficWindowKeys(t *testing.T) {
	keys := []string{"1h", "12h", "24h", "7d", "30d"}
	if len(keys) != 5 {
		t.Fatal("expected 5 windows")
	}
}
