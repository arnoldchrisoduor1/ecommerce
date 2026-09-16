package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const (
	BcryptCost          = 12
	AccessTokenTTL      = 15 * time.Minute
	RefreshTokenTTL     = 30 * 24 * time.Hour
	VerificationTTL     = 10 * time.Minute
	MaxCodeAttempts     = 5
	RefreshCookieName   = "studio_refresh"
)

type UserConfig struct {
	JWTSecret    []byte
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	CookieSecure bool
	CookieDomain string
}

type UserClaims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

func LoadUserConfig() (UserConfig, error) {
	secret := os.Getenv("USER_JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("ADMIN_JWT_SECRET")
	}
	if secret == "" || len(secret) < 32 {
		return UserConfig{}, errors.New("USER_JWT_SECRET (or ADMIN_JWT_SECRET) must be set and >= 32 chars")
	}
	cfg := UserConfig{
		JWTSecret:    []byte(secret),
		AccessTTL:    AccessTokenTTL,
		RefreshTTL:   RefreshTokenTTL,
		CookieSecure: strings.EqualFold(os.Getenv("AUTH_COOKIE_SECURE"), "true"),
		CookieDomain: os.Getenv("AUTH_COOKIE_DOMAIN"),
	}
	if v := os.Getenv("USER_ACCESS_TTL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			cfg.AccessTTL = d
		}
	}
	return cfg, nil
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func IssueAccessToken(cfg UserConfig, userID, email string) (string, time.Time, error) {
	expiresAt := time.Now().UTC().Add(cfg.AccessTTL)
	claims := UserClaims{
		Email: email,
		Role:  "user",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(cfg.JWTSecret)
	return signed, expiresAt, err
}

func ParseAccessToken(secret []byte, tokenString string) (*UserClaims, error) {
	claims := &UserClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid || claims.Role != "user" {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func NewRefreshToken() (raw string, hash string, familyID uuid.UUID, err error) {
	familyID = uuid.New()
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", uuid.Nil, err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	hash = HashToken(raw)
	return raw, hash, familyID, nil
}

func RotateRefreshToken(familyID uuid.UUID) (raw string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	hash = HashToken(raw)
	return raw, hash, nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func GenerateDigitCode(n int) (string, error) {
	if n <= 0 || n > 10 {
		n = 5
	}
	max := 1
	for i := 0; i < n; i++ {
		max *= 10
	}
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	v := int(buf[0])<<24 | int(buf[1])<<16 | int(buf[2])<<8 | int(buf[3])
	if v < 0 {
		v = -v
	}
	code := v % max
	return fmt.Sprintf("%0"+strconv.Itoa(n)+"d", code), nil
}

func HashCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:])
}
