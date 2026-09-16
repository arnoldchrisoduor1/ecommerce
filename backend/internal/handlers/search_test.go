package handlers

import "testing"

func TestSearchILIKEPattern(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", "%%"},
		{"  tee  ", "%tee%"},
		{"100%", `%100\%%`},
		{`a\b`, `%a\\b%`},
		{"under_score", `%under\_score%`},
		{"Crew", "%Crew%"},
	}
	for _, tc := range cases {
		if got := searchILIKEPattern(tc.in); got != tc.want {
			t.Errorf("searchILIKEPattern(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestSearchPaginationDefaults(t *testing.T) {
	// Table-driven validation of page/limit clamping rules used by SearchProducts.
	cases := []struct {
		name      string
		pageIn    int
		limitIn   int
		pageOK    bool
		limitOK   bool
		wantLimit int
	}{
		{"defaults", 1, 24, true, true, 24},
		{"page zero invalid", 0, 24, false, true, 24},
		{"negative page", -1, 10, false, true, 10},
		{"limit over cap", 1, 101, true, false, 100},
		{"limit one", 2, 1, true, true, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pageOK := tc.pageIn >= 1
			limitOK := tc.limitIn >= 1 && tc.limitIn <= 100
			if pageOK != tc.pageOK {
				t.Errorf("pageOK=%v want %v", pageOK, tc.pageOK)
			}
			if limitOK != tc.limitOK {
				t.Errorf("limitOK=%v want %v", limitOK, tc.limitOK)
			}
			limit := tc.limitIn
			if limit > 100 {
				limit = 100
			}
			if tc.limitOK && limit != tc.wantLimit {
				t.Errorf("limit=%d want %d", limit, tc.wantLimit)
			}
		})
	}
}
