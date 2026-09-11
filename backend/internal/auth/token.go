package auth

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const adminRole = "admin"

type AdminConfig struct {
	Email     string
	Password  string
	JWTSecret []byte
	TokenTTL  time.Duration
}

type AdminClaims struct {
	Role  string `json:"role"`
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func LoadAdminConfig() (AdminConfig, error) {
	email := os.Getenv("ADMIN_EMAIL")
	password := os.Getenv("ADMIN_PASSWORD")
	secret := os.Getenv("ADMIN_JWT_SECRET")

	if email == "" || password == "" || secret == "" {
		return AdminConfig{}, errors.New("ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_JWT_SECRET must be set")
	}
	if len(secret) < 32 {
		return AdminConfig{}, errors.New("ADMIN_JWT_SECRET must be at least 32 characters")
	}

	ttl := 24 * time.Hour
	if v := os.Getenv("ADMIN_JWT_TTL"); v != "" {
		parsed, err := time.ParseDuration(v)
		if err != nil {
			return AdminConfig{}, fmt.Errorf("invalid ADMIN_JWT_TTL: %w", err)
		}
		ttl = parsed
	}

	return AdminConfig{
		Email:     email,
		Password:  password,
		JWTSecret: []byte(secret),
		TokenTTL:  ttl,
	}, nil
}

func ValidateAdminCredentials(cfg AdminConfig, email, password string) bool {
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(email)), []byte(strings.ToLower(cfg.Email))) != 1 {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(password), []byte(cfg.Password)) == 1
}

func IssueAdminToken(cfg AdminConfig) (string, time.Time, error) {
	expiresAt := time.Now().Add(cfg.TokenTTL)
	claims := AdminClaims{
		Role:  adminRole,
		Email: cfg.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   cfg.Email,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(cfg.JWTSecret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

func ParseAdminToken(secret []byte, tokenString string) (*AdminClaims, error) {
	claims := &AdminClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.Role != adminRole {
		return nil, errors.New("invalid role")
	}
	return claims, nil
}

func BearerToken(header string) (string, error) {
	if header == "" {
		return "", errors.New("missing authorization header")
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", errors.New("invalid authorization header")
	}
	return parts[1], nil
}
