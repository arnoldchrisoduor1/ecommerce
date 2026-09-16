package handlers

import "testing"

func TestFirstNameOnly(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "Someone"},
		{"  Carol  ", "Carol"},
		{"Kevin Smith", "Kevin"},
		{"Francie", "Francie"},
	}
	for _, tc := range cases {
		if got := firstNameOnly(tc.in); got != tc.want {
			t.Errorf("firstNameOnly(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestActivityMessage(t *testing.T) {
	item := "Heavyweight Tee"
	if got := activityMessage("purchase", "Carol", &item); got != "Carol bought Heavyweight Tee" {
		t.Fatalf("purchase msg=%q", got)
	}
	if got := activityMessage("wishlist_add", "Kevin", &item); got != "Kevin saved Heavyweight Tee" {
		t.Fatalf("wishlist msg=%q", got)
	}
	if got := activityMessage("cart_add", "Francie", &item); got != "Francie added Heavyweight Tee to cart" {
		t.Fatalf("cart msg=%q", got)
	}
	if got := activityMessage("newsletter_signup", "Amina", nil); got != "Amina signed up for the newsletter" {
		t.Fatalf("newsletter msg=%q", got)
	}
}
