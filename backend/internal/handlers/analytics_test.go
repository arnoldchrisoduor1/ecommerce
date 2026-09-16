package handlers

import "testing"

func TestNormalizeEntityType(t *testing.T) {
	cases := []struct{ in, want string }{
		{"product", "product"},
		{"BLOG", "blog"},
		{"", "page"},
		{"other", "page"},
	}
	for _, tc := range cases {
		if got := normalizeEntityType(tc.in); got != tc.want {
			t.Errorf("normalizeEntityType(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestViewerLabel(t *testing.T) {
	name := "Carol Ngugi"
	if got := viewerLabel(&name, "abcdefgh"); got != "Carol" {
		t.Fatalf("named=%q", got)
	}
	got := viewerLabel(nil, "abcdefghij")
	if got != "Guest · session abcdef" {
		t.Fatalf("guest=%q", got)
	}
}
