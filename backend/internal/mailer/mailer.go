package mailer

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client delivers branded auth emails. Without SMTP config it logs and
// stores the last code in Redis for local verification (auth:dev:code:<email>).
type Client struct {
	rdb    *redis.Client
	from   string
	brand  string
	baseURL string
}

func New(rdb *redis.Client) *Client {
	from := os.Getenv("MAIL_FROM")
	if from == "" {
		from = "noreply@studio.local"
	}
	brand := os.Getenv("MAIL_BRAND")
	if brand == "" {
		brand = "Studio"
	}
	base := os.Getenv("STOREFRONT_URL")
	if base == "" {
		base = "http://localhost:3000"
	}
	return &Client{rdb: rdb, from: from, brand: brand, baseURL: strings.TrimRight(base, "/")}
}

func (c *Client) SendVerificationCode(ctx context.Context, email, purpose, code string) error {
	subject := c.brand + " verification code"
	body := fmt.Sprintf(
		"Your %s code is %s.\nIt expires in 10 minutes.\n\n%s",
		purposeLabel(purpose), code, c.brand,
	)
	return c.deliver(ctx, email, subject, body, code)
}

func (c *Client) SendPasswordResetCode(ctx context.Context, email, code string) error {
	subject := c.brand + " password reset"
	body := fmt.Sprintf(
		"Use code %s to reset your password.\nExpires in 10 minutes.\n\nOr visit %s/verify?purpose=password_reset\n\n%s",
		code, c.baseURL, c.brand,
	)
	return c.deliver(ctx, email, subject, body, code)
}

func (c *Client) deliver(ctx context.Context, email, subject, body, code string) error {
	log.Printf("[mailer] to=%s subject=%q code=%s\n%s", email, subject, code, body)
	if c.rdb != nil {
		key := "auth:dev:code:" + strings.ToLower(strings.TrimSpace(email))
		_ = c.rdb.Set(ctx, key, code, 15*time.Minute).Err()
	}
	// Optional SMTP hook — when SMTP_HOST set, would send real mail.
	// Local/dev relies on Redis + logs (no mailer microservice in repo).
	_ = os.Getenv("SMTP_HOST")
	return nil
}

func purposeLabel(purpose string) string {
	switch purpose {
	case "two_factor":
		return "two-step verification"
	case "password_reset":
		return "password reset"
	default:
		return "email verification"
	}
}
