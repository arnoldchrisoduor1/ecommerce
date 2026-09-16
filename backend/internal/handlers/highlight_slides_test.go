package handlers

import "testing"

func TestNormalizeCaptionPosition(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"top", "top"},
		{"BOTTOM", "bottom"},
		{"centre", "centre"},
		{"center", "centre"},
		{"", "bottom"},
		{"side", "bottom"},
	}
	for _, tc := range cases {
		if got := normalizeCaptionPosition(tc.in); got != tc.want {
			t.Errorf("normalizeCaptionPosition(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}
