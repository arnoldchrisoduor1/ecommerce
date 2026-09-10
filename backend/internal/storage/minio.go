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

// Client wraps MinIO object storage for product/media uploads.
type Client struct {
	mc         *minio.Client
	bucket     string
	publicBase string
}

// ConfigFromEnv reads MinIO settings. Returns nil if MINIO_ENDPOINT is unset
// so local/dev can run without object storage until it is configured.
func ConfigFromEnv() (*Client, error) {
	endpoint := strings.TrimSpace(os.Getenv("MINIO_ENDPOINT"))
	if endpoint == "" {
		return nil, nil
	}
	access := os.Getenv("MINIO_ACCESS_KEY")
	secret := os.Getenv("MINIO_SECRET_KEY")
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "ecommerce"
	}
	useSSL := strings.EqualFold(os.Getenv("MINIO_USE_SSL"), "true")
	publicBase := strings.TrimRight(os.Getenv("MINIO_PUBLIC_BASE_URL"), "/")
	if publicBase == "" {
		scheme := "http"
		if useSSL {
			scheme = "https"
		}
		publicBase = fmt.Sprintf("%s://%s/%s", scheme, endpoint, bucket)
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(access, secret, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	ctx := context.Background()
	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio make bucket: %w", err)
		}
	}

	return &Client{mc: mc, bucket: bucket, publicBase: publicBase}, nil
}

// Put uploads an object and returns its public URL.
func (c *Client) Put(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) (string, error) {
	objectKey = strings.TrimLeft(objectKey, "/")
	_, err := c.mc.PutObject(ctx, c.bucket, objectKey, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return c.PublicURL(objectKey), nil
}

// PublicURL builds a browser-reachable URL for an object key.
func (c *Client) PublicURL(objectKey string) string {
	objectKey = strings.TrimLeft(objectKey, "/")
	base, err := url.Parse(c.publicBase)
	if err != nil {
		return c.publicBase + "/" + objectKey
	}
	joined, err := url.JoinPath(base.String(), objectKey)
	if err != nil {
		return strings.TrimRight(c.publicBase, "/") + "/" + objectKey
	}
	return joined
}
