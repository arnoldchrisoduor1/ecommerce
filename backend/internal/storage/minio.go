package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client talks to object storage for uploads and expands keys to public URLs.
// DB columns store bare object keys (or site-relative paths like /media/...).
type Client struct {
	mc         *minio.Client // nil when only public URL expansion is configured
	bucket     string
	publicBase string
}

func envFirst(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

// ConfigFromEnv builds a Client from S3_* (preferred) or legacy MINIO_* vars.
// Returns (nil, nil) when neither internal endpoint nor public base is set.
func ConfigFromEnv() (*Client, error) {
	endpoint := envFirst("S3_INTERNAL_ENDPOINT", "MINIO_ENDPOINT")
	publicBase := strings.TrimRight(envFirst("S3_PUBLIC_BASE_URL", "MINIO_PUBLIC_BASE_URL"), "/")
	access := envFirst("MINIO_ACCESS_KEY", "S3_ACCESS_KEY")
	secret := envFirst("MINIO_SECRET_KEY", "S3_SECRET_KEY")
	bucket := envFirst("MINIO_BUCKET", "S3_BUCKET")
	if bucket == "" {
		bucket = "ecommerce"
	}
	useSSL := strings.EqualFold(os.Getenv("MINIO_USE_SSL"), "true") ||
		strings.EqualFold(os.Getenv("S3_USE_SSL"), "true")

	if endpoint == "" && publicBase == "" {
		return nil, nil
	}

	if publicBase == "" && endpoint != "" {
		scheme := "http"
		if useSSL {
			scheme = "https"
		}
		// Dev fallback only — prefer explicit S3_PUBLIC_BASE_URL in all envs.
		publicBase = fmt.Sprintf("%s://%s/%s", scheme, endpoint, bucket)
	}

	c := &Client{bucket: bucket, publicBase: publicBase}
	if endpoint == "" {
		return c, nil
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(access, secret, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}

	ctx := context.Background()
	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("s3 bucket check: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("s3 make bucket: %w", err)
		}
	}

	c.mc = mc
	return c, nil
}

// CanUpload reports whether Put is available.
func (c *Client) CanUpload() bool {
	return c != nil && c.mc != nil
}

// Put uploads an object and returns the bare object key (not a URL).
func (c *Client) Put(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) (string, error) {
	if !c.CanUpload() {
		return "", fmt.Errorf("object storage upload not configured (set S3_INTERNAL_ENDPOINT)")
	}
	objectKey = NormalizeObjectKey(objectKey)
	if objectKey == "" || strings.HasPrefix(objectKey, "/") {
		return "", fmt.Errorf("invalid object key")
	}
	_, err := c.mc.PutObject(ctx, c.bucket, objectKey, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return objectKey, nil
}

// NormalizeObjectKey strips absolute URL prefixes, leaving a bare key or a
// site-relative path (leading slash). Empty input stays empty.
func NormalizeObjectKey(stored string) string {
	stored = strings.TrimSpace(stored)
	if stored == "" {
		return ""
	}
	// Site-relative (Next public assets, etc.) — leave alone.
	if strings.HasPrefix(stored, "/") {
		return stored
	}
	if !strings.Contains(stored, "://") {
		return strings.TrimLeft(stored, "/")
	}

	u, err := url.Parse(stored)
	if err != nil || u.Path == "" {
		return stored
	}
	path := strings.TrimPrefix(u.Path, "/")
	// Common shapes:
	//   http://localhost:9000/ecommerce/cms/hero.jpg  → cms/hero.jpg
	//   https://api.example/media/cms/hero.jpg        → cms/hero.jpg
	parts := strings.SplitN(path, "/", 2)
	if len(parts) == 2 {
		first := strings.ToLower(parts[0])
		if first == "media" || first == "ecommerce" {
			return parts[1]
		}
	}
	return path
}

// PublicURL turns a stored key (or site-relative path) into a browser URL.
func (c *Client) PublicURL(stored string) string {
	if c == nil {
		return stored
	}
	key := NormalizeObjectKey(stored)
	if key == "" {
		return ""
	}
	if strings.HasPrefix(key, "/") {
		return key
	}
	if c.publicBase == "" {
		return key
	}
	base, err := url.Parse(c.publicBase)
	if err != nil {
		return strings.TrimRight(c.publicBase, "/") + "/" + key
	}
	joined, err := url.JoinPath(base.String(), key)
	if err != nil {
		return strings.TrimRight(c.publicBase, "/") + "/" + key
	}
	return joined
}
