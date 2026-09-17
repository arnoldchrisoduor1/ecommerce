package openrouter

import "testing"

func TestResolveModel(t *testing.T) {
	if got := ResolveModel(""); got != DefaultModel {
		t.Fatalf("empty env: got %q want %q", got, DefaultModel)
	}
	if got := ResolveModel("qwen/qwen3-30b-a3b-instruct-2507"); got != "qwen/qwen3-30b-a3b-instruct-2507" {
		t.Fatalf("custom qwen: got %q", got)
	}
	if got := ResolveModel("anthropic/claude-3.5-sonnet"); got != DefaultModel {
		t.Fatalf("anthropic slug must fall back to default, got %q", got)
	}
	if got := ResolveModel("claude-sonnet-4-20250514"); got != DefaultModel {
		t.Fatalf("claude slug must fall back to default, got %q", got)
	}
}

func TestIsAnthropicModel(t *testing.T) {
	if !IsAnthropicModel("anthropic/claude-3-haiku") {
		t.Fatal("expected anthropic model detected")
	}
	if IsAnthropicModel("qwen/qwen3-30b-a3b-instruct-2507") {
		t.Fatal("qwen must not be anthropic")
	}
}
