package handlers

import "testing"

func TestNormalizeNewsletterEmail(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  Foo@Bar.COM ", "foo@bar.com"},
		{"a@b.co", "a@b.co"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := normalizeNewsletterEmail(tc.in); got != tc.want {
			t.Errorf("normalizeNewsletterEmail(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidNewsletterEmail(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"a@b.co", true},
		{"user.name+tag@example.com", true},
		{"", false},
		{"no-at", false},
		{"@nodomain.com", false},
		{"nodomain@", false},
		{"a@b", false},
		{"a@.com", false},
	}
	for _, tc := range cases {
		if got := validNewsletterEmail(tc.in); got != tc.want {
			t.Errorf("validNewsletterEmail(%q)=%v want %v", tc.in, got, tc.want)
		}
	}
}

func TestAllowedNewsletterSources(t *testing.T) {
	for _, s := range []string{"footer", "modal", "checkout"} {
		if !allowedNewsletterSources[s] {
			t.Errorf("source %q should be allowed", s)
		}
	}
	if allowedNewsletterSources["spam"] {
		t.Fatal("spam source must not be allowed")
	}
}
