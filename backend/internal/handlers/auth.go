package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"ecommerce-backend/internal/auth"
)

const (
	authRateLoginKey  = "auth:rl:login:"
	authRateCodeKey   = "auth:rl:code:"
	loginRateWindow   = 15 * time.Minute
	loginRateMax      = 5
	codeRateWindow    = 15 * time.Minute
	codeRateMax       = 3
	ctxUserIDKey      = "authUserID"
	ctxUserEmailKey   = "authUserEmail"
)

type authRegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
}

type authLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Code     string `json:"code,omitempty"`
}

type authCodeRequest struct {
	Purpose string `json:"purpose"` // email_verify | two_factor | password_reset
	Email   string `json:"email,omitempty"`
}

type authVerifyRequest struct {
	Purpose string `json:"purpose"`
	Code    string `json:"code"`
	Email   string `json:"email,omitempty"`
}

type authResetRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"new_password"`
}

type authUserResponse struct {
	ID                          string     `json:"id"`
	Email                       string     `json:"email"`
	FullName                    *string    `json:"full_name,omitempty"`
	CustomerID                  *string    `json:"customer_id,omitempty"`
	EmailVerified               bool       `json:"email_verified"`
	TwoFactorEnabled            bool       `json:"two_factor_enabled"`
	TwoFactorPromptedAt         *time.Time `json:"two_factor_prompted_at,omitempty"`
	TwoFactorReminderDismissed  bool       `json:"two_factor_reminder_dismissed"`
	NeedsTwoFactorSuggestion    bool       `json:"needs_two_factor_suggestion"`
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (h *Handler) authRateAllow(ctx context.Context, prefix, key string, max int, window time.Duration) bool {
	if h.rdb == nil || key == "" {
		return true
	}
	rk := prefix + key
	n, err := h.rdb.Incr(ctx, rk).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		_ = h.rdb.Expire(ctx, rk, window).Err()
	}
	return n <= int64(max)
}

func (h *Handler) AuthRegister(c *fiber.Ctx) error {
	var req authRegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	email := normalizeEmail(req.Email)
	pass := req.Password
	if email == "" || !strings.Contains(email, "@") {
		return badRequest(c, "valid email is required")
	}
	if len(pass) < 8 {
		return badRequest(c, "password must be at least 8 characters")
	}
	ip := c.IP()
	if !h.authRateAllow(c.Context(), authRateLoginKey, "ip:"+ip, loginRateMax, loginRateWindow) ||
		!h.authRateAllow(c.Context(), authRateLoginKey, "email:"+email, loginRateMax, loginRateWindow) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many attempts, try again later"})
	}

	hash, err := auth.HashPassword(pass)
	if err != nil {
		return internalError(c, "AuthRegister hash", err)
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "AuthRegister begin", err)
	}
	defer tx.Rollback(c.Context())

	var customerID string
	err = tx.QueryRow(c.Context(), `SELECT id FROM customers WHERE lower(email) = $1`, email).Scan(&customerID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(c.Context(), `
			INSERT INTO customers (email, full_name, password_hash, is_guest)
			VALUES ($1, $2, $3, false) RETURNING id`,
			email, nullIfEmpty(strings.TrimSpace(req.FullName)), hash,
		).Scan(&customerID)
		if err != nil {
			return internalError(c, "AuthRegister customer insert", err)
		}
	} else if err != nil {
		return internalError(c, "AuthRegister customer lookup", err)
	} else {
		_, err = tx.Exec(c.Context(), `
			UPDATE customers SET is_guest = false, password_hash = $1,
				full_name = COALESCE(NULLIF($2, ''), full_name), updated_at = now()
			WHERE id = $3`, hash, strings.TrimSpace(req.FullName), customerID)
		if err != nil {
			return internalError(c, "AuthRegister customer update", err)
		}
	}

	var userID string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO users (email, password_hash, full_name, customer_id, two_factor_prompted_at)
		VALUES ($1, $2, $3, $4, now())
		RETURNING id`,
		email, hash, nullIfEmpty(strings.TrimSpace(req.FullName)), customerID,
	).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "users_email_key") || strings.Contains(err.Error(), "unique") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "could not create account"})
		}
		return internalError(c, "AuthRegister user insert", err)
	}
	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "AuthRegister commit", err)
	}

	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return internalError(c, "AuthRegister load", err)
	}
	tokens, err := h.issueSession(c, user)
	if err != nil {
		return internalError(c, "AuthRegister session", err)
	}
	user.NeedsTwoFactorSuggestion = !user.TwoFactorEnabled && user.TwoFactorPromptedAt != nil
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"user":          user,
		"access_token":  tokens.access,
		"expires_at":    tokens.expiresAt,
		"suggest_2fa":   true,
	})
}

func (h *Handler) AuthLogin(c *fiber.Ctx) error {
	var req authLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	email := normalizeEmail(req.Email)
	ip := c.IP()
	if !h.authRateAllow(c.Context(), authRateLoginKey, "ip:"+ip, loginRateMax, loginRateWindow) ||
		!h.authRateAllow(c.Context(), authRateLoginKey, "email:"+email, loginRateMax, loginRateWindow) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many attempts, try again later"})
	}

	var userID, hash string
	var twoFactor bool
	err := h.db.QueryRow(c.Context(), `
		SELECT id, password_hash, two_factor_enabled FROM users WHERE email = $1`, email,
	).Scan(&userID, &hash, &twoFactor)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid email or password"})
	}
	if !auth.CheckPassword(hash, req.Password) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid email or password"})
	}

	if twoFactor {
		if strings.TrimSpace(req.Code) == "" {
			if err := h.issueVerificationCode(c.Context(), userID, email, "two_factor"); err != nil {
				return internalError(c, "AuthLogin 2fa code", err)
			}
			return c.JSON(fiber.Map{"two_factor_required": true})
		}
		ok, verr := h.consumeVerificationCode(c.Context(), userID, "two_factor", req.Code)
		if verr != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": verr.Error()})
		}
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired code"})
		}
	}

	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return internalError(c, "AuthLogin load", err)
	}
	tokens, err := h.issueSession(c, user)
	if err != nil {
		return internalError(c, "AuthLogin session", err)
	}
	return c.JSON(fiber.Map{
		"user":         user,
		"access_token": tokens.access,
		"expires_at":   tokens.expiresAt,
	})
}

func (h *Handler) AuthLogout(c *fiber.Ctx) error {
	raw := c.Cookies(auth.RefreshCookieName)
	if raw != "" {
		hash := auth.HashToken(raw)
		_, _ = h.db.Exec(c.Context(), `
			UPDATE refresh_tokens SET revoked_at = now()
			WHERE token_hash = $1 AND revoked_at IS NULL`, hash)
	}
	c.ClearCookie(auth.RefreshCookieName)
	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) AuthRefresh(c *fiber.Ctx) error {
	raw := c.Cookies(auth.RefreshCookieName)
	if raw == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	hash := auth.HashToken(raw)

	var id, userID, familyID string
	var expiresAt time.Time
	var revokedAt *time.Time
	err := h.db.QueryRow(c.Context(), `
		SELECT id, user_id, family_id, expires_at, revoked_at
		FROM refresh_tokens WHERE token_hash = $1`, hash,
	).Scan(&id, &userID, &familyID, &expiresAt, &revokedAt)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	if revokedAt != nil || time.Now().UTC().After(expiresAt) {
		// Reuse detection: revoke whole family
		_, _ = h.db.Exec(c.Context(), `
			UPDATE refresh_tokens SET revoked_at = now()
			WHERE family_id = $1 AND revoked_at IS NULL`, familyID)
		c.ClearCookie(auth.RefreshCookieName)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	newRaw, newHash, err := auth.RotateRefreshToken(uuid.MustParse(familyID))
	if err != nil {
		return internalError(c, "AuthRefresh rotate", err)
	}
	newExpiry := time.Now().UTC().Add(h.userAuth.RefreshTTL)
	var newID string
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_hash)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		userID, newHash, familyID, newExpiry, string(c.Request().Header.UserAgent()), hashIP(c.IP()),
	).Scan(&newID)
	if err != nil {
		return internalError(c, "AuthRefresh insert", err)
	}
	_, _ = h.db.Exec(c.Context(), `
		UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2`, newID, id)

	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return internalError(c, "AuthRefresh load", err)
	}
	access, accessExp, err := auth.IssueAccessToken(h.userAuth, user.ID, user.Email)
	if err != nil {
		return internalError(c, "AuthRefresh access", err)
	}
	h.setRefreshCookie(c, newRaw, newExpiry)
	return c.JSON(fiber.Map{
		"user":         user,
		"access_token": access,
		"expires_at":   accessExp,
	})
}

func (h *Handler) AuthMe(c *fiber.Ctx) error {
	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	return c.JSON(fiber.Map{"user": user})
}

func (h *Handler) AuthRequestCode(c *fiber.Ctx) error {
	var req authCodeRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	purpose := strings.TrimSpace(req.Purpose)
	if purpose == "" {
		purpose = "email_verify"
	}
	email := normalizeEmail(req.Email)
	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		if email == "" {
			return badRequest(c, "email is required")
		}
		_ = h.db.QueryRow(c.Context(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	} else {
		_ = h.db.QueryRow(c.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	}
	// Always generic success — never reveal account existence
	ip := c.IP()
	if !h.authRateAllow(c.Context(), authRateCodeKey, "ip:"+ip, codeRateMax, codeRateWindow) ||
		!h.authRateAllow(c.Context(), authRateCodeKey, "email:"+email, codeRateMax, codeRateWindow) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many attempts, try again later"})
	}
	if userID != "" && email != "" {
		_ = h.issueVerificationCode(c.Context(), userID, email, purpose)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) AuthResendCode(c *fiber.Ctx) error {
	return h.AuthRequestCode(c)
}

func (h *Handler) AuthVerifyCode(c *fiber.Ctx) error {
	var req authVerifyRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	purpose := strings.TrimSpace(req.Purpose)
	code := strings.TrimSpace(req.Code)
	if purpose == "" || code == "" {
		return badRequest(c, "purpose and code are required")
	}
	email := normalizeEmail(req.Email)
	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		if email == "" {
			return badRequest(c, "email is required")
		}
		err := h.db.QueryRow(c.Context(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired code"})
		}
	}
	ok, verr := h.consumeVerificationCode(c.Context(), userID, purpose, code)
	if verr != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": verr.Error()})
	}
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired code"})
	}
	switch purpose {
	case "email_verify":
		_, _ = h.db.Exec(c.Context(), `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, userID)
	case "two_factor":
		_, _ = h.db.Exec(c.Context(), `
			UPDATE users SET two_factor_enabled = true, two_factor_prompted_at = COALESCE(two_factor_prompted_at, now()),
				updated_at = now() WHERE id = $1`, userID)
	}
	user, err := h.loadAuthUser(c.Context(), userID)
	if err != nil {
		return internalError(c, "AuthVerifyCode load", err)
	}
	return c.JSON(fiber.Map{"ok": true, "user": user})
}

func (h *Handler) AuthForgotPassword(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	email := normalizeEmail(req.Email)
	ip := c.IP()
	if !h.authRateAllow(c.Context(), authRateCodeKey, "ip:"+ip, codeRateMax, codeRateWindow) ||
		!h.authRateAllow(c.Context(), authRateCodeKey, "email:"+email, codeRateMax, codeRateWindow) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many attempts, try again later"})
	}
	var userID string
	if err := h.db.QueryRow(c.Context(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err == nil {
		_ = h.issueVerificationCode(c.Context(), userID, email, "password_reset")
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) AuthResetPassword(c *fiber.Ctx) error {
	var req authResetRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	email := normalizeEmail(req.Email)
	if len(req.NewPassword) < 8 {
		return badRequest(c, "password must be at least 8 characters")
	}
	var userID string
	err := h.db.QueryRow(c.Context(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired code"})
	}
	ok, verr := h.consumeVerificationCode(c.Context(), userID, "password_reset", req.Code)
	if verr != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": verr.Error()})
	}
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid or expired code"})
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		return internalError(c, "AuthResetPassword hash", err)
	}
	_, err = h.db.Exec(c.Context(), `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, hash, userID)
	if err != nil {
		return internalError(c, "AuthResetPassword update", err)
	}
	_, _ = h.db.Exec(c.Context(), `
		UPDATE customers SET password_hash = $1, updated_at = now()
		WHERE id = (SELECT customer_id FROM users WHERE id = $2)`, hash, userID)
	_, _ = h.db.Exec(c.Context(), `
		UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return c.JSON(fiber.Map{"ok": true})
}

type twoFactorToggleRequest struct {
	Enabled bool `json:"enabled"`
}

func (h *Handler) AuthSetTwoFactor(c *fiber.Ctx) error {
	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var req twoFactorToggleRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.Enabled {
		var email string
		_ = h.db.QueryRow(c.Context(), `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
		if err := h.issueVerificationCode(c.Context(), userID, email, "two_factor"); err != nil {
			return internalError(c, "AuthSetTwoFactor code", err)
		}
		return c.JSON(fiber.Map{"two_factor_required": true})
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE users SET two_factor_enabled = false, updated_at = now() WHERE id = $1`, userID)
	if err != nil {
		return internalError(c, "AuthSetTwoFactor disable", err)
	}
	user, _ := h.loadAuthUser(c.Context(), userID)
	return c.JSON(fiber.Map{"user": user})
}

func (h *Handler) AuthDismissTwoFactorReminder(c *fiber.Ctx) error {
	userID, _ := c.Locals(ctxUserIDKey).(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE users SET two_factor_reminder_dismissed_at = now(), updated_at = now() WHERE id = $1`, userID)
	if err != nil {
		return internalError(c, "AuthDismissTwoFactorReminder", err)
	}
	user, _ := h.loadAuthUser(c.Context(), userID)
	return c.JSON(fiber.Map{"user": user})
}

type sessionTokens struct {
	access    string
	expiresAt time.Time
}

func (h *Handler) issueSession(c *fiber.Ctx, user *authUserResponse) (*sessionTokens, error) {
	access, exp, err := auth.IssueAccessToken(h.userAuth, user.ID, user.Email)
	if err != nil {
		return nil, err
	}
	raw, hash, familyID, err := auth.NewRefreshToken()
	if err != nil {
		return nil, err
	}
	refreshExp := time.Now().UTC().Add(h.userAuth.RefreshTTL)
	_, err = h.db.Exec(c.Context(), `
		INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_hash)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		user.ID, hash, familyID, refreshExp, string(c.Request().Header.UserAgent()), hashIP(c.IP()),
	)
	if err != nil {
		return nil, err
	}
	h.setRefreshCookie(c, raw, refreshExp)
	return &sessionTokens{access: access, expiresAt: exp}, nil
}

func (h *Handler) setRefreshCookie(c *fiber.Ctx, raw string, expires time.Time) {
	c.Cookie(&fiber.Cookie{
		Name:     auth.RefreshCookieName,
		Value:    raw,
		Expires:  expires,
		HTTPOnly: true,
		Secure:   h.userAuth.CookieSecure,
		SameSite: "Lax",
		Path:     "/api/auth",
		Domain:   h.userAuth.CookieDomain,
	})
}

func (h *Handler) loadAuthUser(ctx context.Context, userID string) (*authUserResponse, error) {
	var u authUserResponse
	var fullName *string
	var customerID *string
	var verifiedAt *time.Time
	var promptedAt *time.Time
	var dismissedAt *time.Time
	err := h.db.QueryRow(ctx, `
		SELECT id, email, full_name, customer_id, email_verified_at,
			two_factor_enabled, two_factor_prompted_at, two_factor_reminder_dismissed_at
		FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.Email, &fullName, &customerID, &verifiedAt,
		&u.TwoFactorEnabled, &promptedAt, &dismissedAt)
	if err != nil {
		return nil, err
	}
	u.FullName = fullName
	u.CustomerID = customerID
	u.EmailVerified = verifiedAt != nil
	u.TwoFactorPromptedAt = promptedAt
	u.TwoFactorReminderDismissed = dismissedAt != nil
	u.NeedsTwoFactorSuggestion = !u.TwoFactorEnabled && promptedAt != nil && dismissedAt == nil
	return &u, nil
}

func (h *Handler) issueVerificationCode(ctx context.Context, userID, email, purpose string) error {
	code, err := auth.GenerateDigitCode(5)
	if err != nil {
		return err
	}
	hash := auth.HashCode(code)
	expires := time.Now().UTC().Add(auth.VerificationTTL)
	_, err = h.db.Exec(ctx, `
		INSERT INTO verification_codes (user_id, code_hash, purpose, expires_at)
		VALUES ($1, $2, $3, $4)`, userID, hash, purpose, expires)
	if err != nil {
		return err
	}
	if purpose == "password_reset" {
		return h.mail.SendPasswordResetCode(ctx, email, code)
	}
	return h.mail.SendVerificationCode(ctx, email, purpose, code)
}

func (h *Handler) consumeVerificationCode(ctx context.Context, userID, purpose, code string) (bool, error) {
	var id string
	var attempts int
	var expiresAt time.Time
	var consumedAt *time.Time
	var hash string
	err := h.db.QueryRow(ctx, `
		SELECT id, code_hash, attempts, expires_at, consumed_at
		FROM verification_codes
		WHERE user_id = $1 AND purpose = $2
		ORDER BY created_at DESC LIMIT 1`, userID, purpose,
	).Scan(&id, &hash, &attempts, &expiresAt, &consumedAt)
	if err != nil {
		return false, nil
	}
	if consumedAt != nil {
		return false, nil
	}
	if attempts >= auth.MaxCodeAttempts {
		return false, errors.New("too many incorrect attempts")
	}
	if time.Now().UTC().After(expiresAt) {
		return false, errors.New("code expired")
	}
	if auth.HashCode(code) != hash {
		_, _ = h.db.Exec(ctx, `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, id)
		if attempts+1 >= auth.MaxCodeAttempts {
			return false, errors.New("too many incorrect attempts")
		}
		return false, nil
	}
	_, err = h.db.Exec(ctx, `UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, id)
	return err == nil, err
}

// RequireUserAuth validates Bearer access token and sets locals.
func (h *Handler) RequireUserAuth(c *fiber.Ctx) error {
	raw, err := auth.BearerToken(c.Get("Authorization"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	claims, err := auth.ParseAccessToken(h.userAuth.JWTSecret, raw)
	if err != nil || claims.Subject == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	c.Locals(ctxUserIDKey, claims.Subject)
	c.Locals(ctxUserEmailKey, claims.Email)
	return c.Next()
}

// OptionalUserAuth sets locals when a valid token is present.
func (h *Handler) OptionalUserAuth(c *fiber.Ctx) error {
	raw, err := auth.BearerToken(c.Get("Authorization"))
	if err == nil {
		if claims, perr := auth.ParseAccessToken(h.userAuth.JWTSecret, raw); perr == nil && claims.Subject != "" {
			c.Locals(ctxUserIDKey, claims.Subject)
			c.Locals(ctxUserEmailKey, claims.Email)
		}
	}
	return c.Next()
}
