package storage

import "testing"

func TestNormalizeObjectKey(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"  ", ""},
		{"cms/hero.jpg", "cms/hero.jpg"},
		{"/media/product.svg", "/media/product.svg"},
		{"http://localhost:9000/ecommerce/cms/hero.jpg", "cms/hero.jpg"},
		{"https://ecomm-api.oduor-arnold.com/media/cms/hero.jpg", "cms/hero.jpg"},
		{"https://cdn.example/other/path.jpg", "other/path.jpg"},
	}
	for _, tc := range cases {
		if got := NormalizeObjectKey(tc.in); got != tc.want {
			t.Fatalf("NormalizeObjectKey(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestPublicURL(t *testing.T) {
	c := &Client{publicBase: "https://ecomm-api.oduor-arnold.com/media"}
	if got := c.PublicURL("cms/hero.jpg"); got != "https://ecomm-api.oduor-arnold.com/media/cms/hero.jpg" {
		t.Fatalf("got %q", got)
	}
	if got := c.PublicURL("/media/product.svg"); got != "/media/product.svg" {
		t.Fatalf("relative got %q", got)
	}
	if got := c.PublicURL("http://localhost:9000/ecommerce/cms/x.jpg"); got != "https://ecomm-api.oduor-arnold.com/media/cms/x.jpg" {
		t.Fatalf("absolute strip got %q", got)
	}
}
