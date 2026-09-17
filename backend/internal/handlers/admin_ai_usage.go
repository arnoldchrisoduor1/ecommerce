package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"ecommerce-backend/internal/openrouter"
)

type adminAIUsageSummary struct {
	KeyLimitRemaining     *float64 `json:"key_limit_remaining,omitempty"`
	KeyLimit              *float64 `json:"key_limit,omitempty"`
	KeyUsage              *float64 `json:"key_usage,omitempty"`
	AccountCreditsRemain  *float64 `json:"account_credits_remaining,omitempty"`
	AccountTotalCredits   *float64 `json:"account_total_credits,omitempty"`
	AccountTotalUsage     *float64 `json:"account_total_usage,omitempty"`
	SpendToday            float64  `json:"spend_today"`
	SpendThisMonth        float64  `json:"spend_this_month"`
	LowBalanceWarning     bool     `json:"low_balance_warning"`
	LowBalanceThreshold   float64  `json:"low_balance_threshold"`
	GloballyEnabled       bool     `json:"globally_enabled"`
	KeyInfoRaw            any      `json:"key_info_raw,omitempty"`
	CreditsRaw            any      `json:"credits_raw,omitempty"`
	KeyInfoError          string   `json:"key_info_error,omitempty"`
	CreditsError          string   `json:"credits_error,omitempty"`
}

func (h *Handler) AdminAIUsageSummary(c *fiber.Ctx) error {
	force := strings.EqualFold(c.Query("refresh"), "true")

	summary := adminAIUsageSummary{
		LowBalanceThreshold: aiLowBalanceThreshold(),
	}

	globalOn, err := h.isAIGloballyEnabled(c.Context())
	if err != nil {
		return internalError(c, "AdminAIUsageSummary settings", err)
	}
	summary.GloballyEnabled = globalOn

	if err := h.db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(estimated_cost), 0)
		FROM ai_usage_log
		WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
	).Scan(&summary.SpendToday); err != nil {
		return internalError(c, "AdminAIUsageSummary spend today", err)
	}
	if err := h.db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(estimated_cost), 0)
		FROM ai_usage_log
		WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')`,
	).Scan(&summary.SpendThisMonth); err != nil {
		return internalError(c, "AdminAIUsageSummary spend month", err)
	}

	if keyInfo, err := openrouter.FetchKeyInfo(c.Context(), h.rdb, force); err != nil {
		summary.KeyInfoError = err.Error()
	} else {
		summary.KeyLimit = &keyInfo.Limit
		summary.KeyLimitRemaining = &keyInfo.LimitRemaining
		summary.KeyUsage = &keyInfo.Usage
		summary.KeyInfoRaw = keyInfo
		if keyInfo.LimitRemaining < summary.LowBalanceThreshold {
			summary.LowBalanceWarning = true
		}
	}

	if credits, err := openrouter.FetchCredits(c.Context(), h.rdb, force); err != nil {
		summary.CreditsError = err.Error()
	} else {
		remaining := credits.TotalCredits - credits.TotalUsage
		summary.AccountTotalCredits = &credits.TotalCredits
		summary.AccountTotalUsage = &credits.TotalUsage
		summary.AccountCreditsRemain = &remaining
		summary.CreditsRaw = credits
		if remaining < summary.LowBalanceThreshold {
			summary.LowBalanceWarning = true
		}
	}

	return c.JSON(summary)
}

type adminAIDailySpend struct {
	Day   string  `json:"day"`
	Spend float64 `json:"spend"`
}

func (h *Handler) AdminAIUsageDaily(c *fiber.Ctx) error {
	days := 30
	if raw := strings.TrimSpace(c.Query("days")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 90 {
			days = n
		}
	}

	rows, err := h.db.Query(c.Context(), `
		SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
			COALESCE(SUM(l.estimated_cost), 0) AS spend
		FROM generate_series(
			(current_date - ($1::int - 1)),
			current_date,
			interval '1 day'
		) AS d(day)
		LEFT JOIN ai_usage_log l
			ON date_trunc('day', l.created_at AT TIME ZONE 'UTC') = d.day
		GROUP BY d.day
		ORDER BY d.day`, days)
	if err != nil {
		return internalError(c, "AdminAIUsageDaily query", err)
	}
	defer rows.Close()

	out := make([]adminAIDailySpend, 0, days)
	for rows.Next() {
		var row adminAIDailySpend
		if err := rows.Scan(&row.Day, &row.Spend); err != nil {
			return internalError(c, "AdminAIUsageDaily scan", err)
		}
		out = append(out, row)
	}
	return c.JSON(fiber.Map{"days": out})
}

type adminAIBreakdownRow struct {
	Feature           string  `json:"feature"`
	Model             string  `json:"model"`
	RequestCount      int64   `json:"request_count"`
	PromptTokens      int64   `json:"prompt_tokens"`
	CompletionTokens  int64   `json:"completion_tokens"`
	EstimatedCost     float64 `json:"estimated_cost"`
}

func (h *Handler) AdminAIUsageBreakdown(c *fiber.Ctx) error {
	from, to := aiUsageDateRange(c)
	rows, err := h.db.Query(c.Context(), `
		SELECT feature, model,
			COUNT(*)::bigint,
			COALESCE(SUM(prompt_tokens), 0)::bigint,
			COALESCE(SUM(completion_tokens), 0)::bigint,
			COALESCE(SUM(estimated_cost), 0)
		FROM ai_usage_log
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY feature, model
		ORDER BY SUM(estimated_cost) DESC`, from, to)
	if err != nil {
		return internalError(c, "AdminAIUsageBreakdown query", err)
	}
	defer rows.Close()

	out := make([]adminAIBreakdownRow, 0)
	for rows.Next() {
		var row adminAIBreakdownRow
		if err := rows.Scan(&row.Feature, &row.Model, &row.RequestCount,
			&row.PromptTokens, &row.CompletionTokens, &row.EstimatedCost); err != nil {
			return internalError(c, "AdminAIUsageBreakdown scan", err)
		}
		out = append(out, row)
	}
	return c.JSON(fiber.Map{"breakdown": out})
}

type adminAIUserRow struct {
	UserID           *string `json:"user_id,omitempty"`
	UserEmail        *string `json:"user_email,omitempty"`
	SessionID        *string `json:"session_id,omitempty"`
	Feature          string  `json:"feature"`
	RequestCount     int64   `json:"request_count"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	EstimatedCost    float64 `json:"estimated_cost"`
	AIAccessEnabled  *bool   `json:"ai_access_enabled,omitempty"`
}

func (h *Handler) AdminAIUsageByUser(c *fiber.Ctx) error {
	from, to := aiUsageDateRange(c)
	sortCol := strings.ToLower(strings.TrimSpace(c.Query("sort", "estimated_cost")))
	order := strings.ToUpper(strings.TrimSpace(c.Query("order", "DESC")))
	if order != "ASC" {
		order = "DESC"
	}
	orderExpr := "estimated_cost DESC"
	switch sortCol {
	case "requests", "request_count":
		orderExpr = "request_count " + order
	case "tokens", "prompt_tokens":
		orderExpr = "prompt_tokens " + order
	case "feature":
		orderExpr = "feature " + order
	default:
		orderExpr = "estimated_cost " + order
	}

	sql := `
		SELECT l.user_id, u.email, l.session_id, l.feature,
			COUNT(*)::bigint,
			COALESCE(SUM(l.prompt_tokens), 0)::bigint,
			COALESCE(SUM(l.completion_tokens), 0)::bigint,
			COALESCE(SUM(l.estimated_cost), 0),
			u.ai_access_enabled
		FROM ai_usage_log l
		LEFT JOIN users u ON u.id = l.user_id
		WHERE l.created_at >= $1 AND l.created_at < $2
		GROUP BY l.user_id, u.email, l.session_id, l.feature, u.ai_access_enabled
		ORDER BY ` + orderExpr

	rows, err := h.db.Query(c.Context(), sql, from, to)
	if err != nil {
		return internalError(c, "AdminAIUsageByUser query", err)
	}
	defer rows.Close()

	out := make([]adminAIUserRow, 0)
	for rows.Next() {
		var row adminAIUserRow
		if err := rows.Scan(&row.UserID, &row.UserEmail, &row.SessionID, &row.Feature,
			&row.RequestCount, &row.PromptTokens, &row.CompletionTokens, &row.EstimatedCost,
			&row.AIAccessEnabled); err != nil {
			return internalError(c, "AdminAIUsageByUser scan", err)
		}
		out = append(out, row)
	}
	return c.JSON(fiber.Map{"users": out, "from": from.Format(time.RFC3339), "to": to.Format(time.RFC3339)})
}

func aiUsageDateRange(c *fiber.Ctx) (time.Time, time.Time) {
	now := time.Now().UTC()
	to := now.Add(24 * time.Hour)
	from := now.AddDate(0, 0, -30)
	if raw := strings.TrimSpace(c.Query("from")); raw != "" {
		if t, err := time.Parse("2006-01-02", raw); err == nil {
			from = t.UTC()
		}
	}
	if raw := strings.TrimSpace(c.Query("to")); raw != "" {
		if t, err := time.Parse("2006-01-02", raw); err == nil {
			to = t.UTC().Add(24 * time.Hour)
		}
	}
	return from, to
}

func (h *Handler) AdminSetAIGlobalEnabled(c *fiber.Ctx) error {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	tag, err := h.db.Exec(c.Context(), `
		UPDATE ai_settings SET features_globally_enabled = $1, updated_at = now()
		WHERE id = 1`, req.Enabled)
	if err != nil {
		return internalError(c, "AdminSetAIGlobalEnabled update", err)
	}
	if tag.RowsAffected() == 0 {
		_, err = h.db.Exec(c.Context(), `
			INSERT INTO ai_settings (id, features_globally_enabled) VALUES (1, $1)`, req.Enabled)
		if err != nil {
			return internalError(c, "AdminSetAIGlobalEnabled insert", err)
		}
	}
	return c.JSON(fiber.Map{"globally_enabled": req.Enabled})
}

func (h *Handler) AdminSetUserAIAccess(c *fiber.Ctx) error {
	userID := c.Params("userId")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}

	tag, err := h.db.Exec(c.Context(), `
		UPDATE users SET ai_access_enabled = $1, updated_at = now()
		WHERE id = $2`, req.Enabled, userID)
	if err != nil {
		return internalError(c, "AdminSetUserAIAccess update", err)
	}
	if tag.RowsAffected() == 0 {
		return notFound(c, "user not found")
	}
	return c.JSON(fiber.Map{"user_id": userID, "ai_access_enabled": req.Enabled})
}

func (h *Handler) AdminRefreshAIBalances(c *fiber.Ctx) error {
	_, _ = openrouter.FetchKeyInfo(c.Context(), h.rdb, true)
	_, _ = openrouter.FetchCredits(c.Context(), h.rdb, true)
	return h.AdminAIUsageSummary(c)
}
