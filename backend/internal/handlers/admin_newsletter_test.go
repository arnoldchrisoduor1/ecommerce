package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestParseNewsletterListFilters(t *testing.T) {
	app := fiber.New()
	var got newsletterListFilters
	var parseErr error
	app.Get("/", func(c *fiber.Ctx) error {
		got, parseErr = parseNewsletterListFilters(c)
		return c.SendStatus(200)
	})

	req := httptest.NewRequest("GET", "/?q=Foo&status=subscribed&registered=guest&include_unsubscribed=1", nil)
	_, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if parseErr != nil {
		t.Fatal(parseErr)
	}
	if got.q != "Foo" || got.status != "subscribed" || got.registered != "guest" {
		t.Fatalf("unexpected filters: %+v", got)
	}
	if !got.includeUnsubscribed {
		t.Fatal("expected includeUnsubscribed")
	}
}

func TestParseNewsletterListFiltersInvalidStatus(t *testing.T) {
	app := fiber.New()
	var parseErr error
	app.Get("/", func(c *fiber.Ctx) error {
		_, parseErr = parseNewsletterListFilters(c)
		return c.SendStatus(200)
	})
	req := httptest.NewRequest("GET", "/?status=bogus", nil)
	_, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if parseErr == nil {
		t.Fatal("expected error for invalid status")
	}
}
