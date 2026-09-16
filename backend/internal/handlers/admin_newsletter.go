package handlers

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type adminNewsletterSubscriber struct {
	ID             string     `json:"id"`
	Email          string     `json:"email"`
	Name           *string    `json:"name,omitempty"`
	Source         string     `json:"source"`
	Status         string     `json:"status"`
	IsRegistered   bool       `json:"is_registered"`
	CreatedAt      time.Time  `json:"created_at"`
	UnsubscribedAt *time.Time `json:"unsubscribed_at,omitempty"`
}

type newsletterListFilters struct {
	q                   string
	status              string // subscribed|unsubscribed|"" (all)
	registered          string // registered|guest|"" (all)
	from, to            *time.Time
	includeUnsubscribed bool
}

func parseNewsletterListFilters(c *fiber.Ctx) (newsletterListFilters, error) {
	f := newsletterListFilters{
		q:      strings.TrimSpace(c.Query("q")),
		status: strings.ToLower(strings.TrimSpace(c.Query("status"))),
	}
	switch f.status {
	case "", "all", "subscribed", "unsubscribed":
		if f.status == "all" {
			f.status = ""
		}
	default:
		return f, fmt.Errorf("invalid status")
	}

	reg := strings.ToLower(strings.TrimSpace(c.Query("registered")))
	switch reg {
	case "", "all":
		f.registered = ""
	case "true", "1", "yes", "registered":
		f.registered = "registered"
	case "false", "0", "no", "guest":
		f.registered = "guest"
	default:
		return f, fmt.Errorf("invalid registered filter")
	}

	if v := c.Query("from"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			return f, fmt.Errorf("invalid from date")
		}
		from := t.UTC()
		f.from = &from
	}
	if v := c.Query("to"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			return f, fmt.Errorf("invalid to date")
		}
		to := t.UTC().Add(24*time.Hour - time.Nanosecond)
		f.to = &to
	}

	inc := strings.ToLower(strings.TrimSpace(c.Query("include_unsubscribed")))
	f.includeUnsubscribed = inc == "1" || inc == "true" || inc == "yes"
	return f, nil
}

// newsletterJoinSQL left-joins customers + users by email for name / registered flag.
const newsletterJoinSQL = `
	FROM newsletter_subscribers ns
	LEFT JOIN LATERAL (
		SELECT c.full_name, (NOT c.is_guest) AS is_registered
		FROM customers c
		WHERE c.email IS NOT NULL AND lower(c.email) = lower(ns.email)
		ORDER BY c.is_guest ASC, c.created_at DESC
		LIMIT 1
	) cust ON true
	LEFT JOIN LATERAL (
		SELECT u.id, u.full_name
		FROM users u
		WHERE lower(u.email) = lower(ns.email)
		ORDER BY u.created_at DESC
		LIMIT 1
	) usr ON true
`

func (f newsletterListFilters) where(args *[]any, excludeUnsubscribed bool) string {
	clauses := []string{"1=1"}
	idx := len(*args) + 1

	if excludeUnsubscribed {
		clauses = append(clauses, "ns.status = 'subscribed'")
	} else if f.status != "" {
		clauses = append(clauses, fmt.Sprintf("ns.status = $%d", idx))
		*args = append(*args, f.status)
		idx++
	}
	if f.q != "" {
		clauses = append(clauses, fmt.Sprintf("lower(ns.email) LIKE $%d", idx))
		*args = append(*args, "%"+strings.ToLower(f.q)+"%")
		idx++
	}
	if f.from != nil {
		clauses = append(clauses, fmt.Sprintf("ns.created_at >= $%d", idx))
		*args = append(*args, *f.from)
		idx++
	}
	if f.to != nil {
		clauses = append(clauses, fmt.Sprintf("ns.created_at <= $%d", idx))
		*args = append(*args, *f.to)
		idx++
	}
	switch f.registered {
	case "registered":
		clauses = append(clauses, "(usr.id IS NOT NULL OR COALESCE(cust.is_registered, false))")
	case "guest":
		clauses = append(clauses, "(usr.id IS NULL AND NOT COALESCE(cust.is_registered, false))")
	}
	_ = idx
	return strings.Join(clauses, " AND ")
}

func scanNewsletterRow(
	id, email, source, status string,
	createdAt time.Time,
	unsubAt pgtype.Timestamptz,
	userID, userName, custName pgtype.Text,
	custRegistered pgtype.Bool,
) adminNewsletterSubscriber {
	row := adminNewsletterSubscriber{
		ID:           id,
		Email:        email,
		Source:       source,
		Status:       status,
		CreatedAt:    createdAt,
		IsRegistered: userID.Valid || (custRegistered.Valid && custRegistered.Bool),
	}
	// Prefer users.full_name, then customers.full_name.
	if userName.Valid && strings.TrimSpace(userName.String) != "" {
		n := strings.TrimSpace(userName.String)
		row.Name = &n
	} else if custName.Valid && strings.TrimSpace(custName.String) != "" {
		n := strings.TrimSpace(custName.String)
		row.Name = &n
	}
	if unsubAt.Valid {
		t := unsubAt.Time
		row.UnsubscribedAt = &t
	}
	return row
}

// AdminListNewsletter returns paginated newsletter subscribers with optional filters.
func (h *Handler) AdminListNewsletter(c *fiber.Ctx) error {
	f, err := parseNewsletterListFilters(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	page := 1
	if v := c.Query("page"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 {
			page = n
		}
	}
	limit := 25
	if v := c.Query("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	offset := (page - 1) * limit

	args := make([]any, 0, 8)
	where := f.where(&args, false)

	var total int64
	countSQL := `SELECT COUNT(*)::bigint ` + newsletterJoinSQL + ` WHERE ` + where
	if err := h.db.QueryRow(c.Context(), countSQL, args...).Scan(&total); err != nil {
		return internalError(c, "AdminListNewsletter count", err)
	}

	listArgs := append(append([]any{}, args...), limit, offset)
	limIdx := len(args) + 1
	offIdx := len(args) + 2
	rows, err := h.db.Query(c.Context(), fmt.Sprintf(`
		SELECT
			ns.id, ns.email, ns.source, ns.status, ns.created_at, ns.unsubscribed_at,
			usr.id::text, usr.full_name, cust.full_name, cust.is_registered
		`+newsletterJoinSQL+`
		WHERE %s
		ORDER BY ns.created_at DESC, ns.id DESC
		LIMIT $%d OFFSET $%d`, where, limIdx, offIdx), listArgs...)
	if err != nil {
		return internalError(c, "AdminListNewsletter query", err)
	}
	defer rows.Close()

	items := make([]adminNewsletterSubscriber, 0, limit)
	for rows.Next() {
		var id, email, source, status string
		var createdAt time.Time
		var unsubAt pgtype.Timestamptz
		var userID, userName, custName pgtype.Text
		var custRegistered pgtype.Bool
		if err := rows.Scan(&id, &email, &source, &status, &createdAt, &unsubAt, &userID, &userName, &custName, &custRegistered); err != nil {
			return internalError(c, "AdminListNewsletter scan", err)
		}
		items = append(items, scanNewsletterRow(id, email, source, status, createdAt, unsubAt, userID, userName, custName, custRegistered))
	}

	pages := int((total + int64(limit) - 1) / int64(limit))
	if pages == 0 {
		pages = 1
	}
	return c.JSON(fiber.Map{
		"subscribers": items,
		"page":        page,
		"limit":       limit,
		"total":       total,
		"pages":       pages,
	})
}

// AdminNewsletterStats returns aggregate subscriber stats.
func (h *Handler) AdminNewsletterStats(c *fiber.Ctx) error {
	var totalSubscribed, totalAll, newWeek, newMonth, unsubscribed int64
	err := h.db.QueryRow(c.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE status = 'subscribed')::bigint,
			COUNT(*)::bigint,
			COUNT(*) FILTER (WHERE status = 'subscribed' AND created_at >= date_trunc('week', now()))::bigint,
			COUNT(*) FILTER (WHERE status = 'subscribed' AND created_at >= date_trunc('month', now()))::bigint,
			COUNT(*) FILTER (WHERE status = 'unsubscribed')::bigint
		FROM newsletter_subscribers`).Scan(
		&totalSubscribed, &totalAll, &newWeek, &newMonth, &unsubscribed)
	if err != nil {
		return internalError(c, "AdminNewsletterStats", err)
	}

	var rate float64
	if totalAll > 0 {
		rate = float64(unsubscribed) / float64(totalAll) * 100
	}
	return c.JSON(fiber.Map{
		"total":             totalSubscribed,
		"new_this_week":     newWeek,
		"new_this_month":    newMonth,
		"unsubscribed":      unsubscribed,
		"unsubscribe_rate":  rate,
	})
}

// AdminNewsletterExportCSV streams filtered subscribers as CSV.
// Unsubscribed rows are excluded unless include_unsubscribed=1.
func (h *Handler) AdminNewsletterExportCSV(c *fiber.Ctx) error {
	f, err := parseNewsletterListFilters(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	args := make([]any, 0, 8)
	where := f.where(&args, !f.includeUnsubscribed)

	rows, err := h.db.Query(c.Context(), `
		SELECT
			ns.email,
			COALESCE(NULLIF(TRIM(usr.full_name), ''), NULLIF(TRIM(cust.full_name), ''), ''),
			ns.created_at,
			ns.source
		`+newsletterJoinSQL+`
		WHERE `+where+`
		ORDER BY ns.created_at DESC
		LIMIT 10000`, args...)
	if err != nil {
		return internalError(c, "AdminNewsletterExportCSV", err)
	}
	defer rows.Close()

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="newsletter-subscribers.csv"`)
	var b strings.Builder
	b.WriteString("email,name,signup_date,source\n")
	for rows.Next() {
		var email, name, source string
		var createdAt time.Time
		if err := rows.Scan(&email, &name, &createdAt, &source); err != nil {
			return internalError(c, "AdminNewsletterExportCSV scan", err)
		}
		b.WriteString(fmt.Sprintf("%s,%s,%s,%s\n",
			csvEscape(email),
			csvEscape(name),
			csvEscape(createdAt.UTC().Format("2006-01-02")),
			csvEscape(source),
		))
	}
	return c.SendString(b.String())
}

// AdminNewsletterEmails returns comma-separated emails for the filtered set.
// Unsubscribed excluded unless include_unsubscribed=1.
func (h *Handler) AdminNewsletterEmails(c *fiber.Ctx) error {
	f, err := parseNewsletterListFilters(c)
	if err != nil {
		return badRequest(c, err.Error())
	}
	args := make([]any, 0, 8)
	where := f.where(&args, !f.includeUnsubscribed)

	rows, err := h.db.Query(c.Context(), `
		SELECT ns.email
		`+newsletterJoinSQL+`
		WHERE `+where+`
		ORDER BY ns.created_at DESC
		LIMIT 10000`, args...)
	if err != nil {
		return internalError(c, "AdminNewsletterEmails", err)
	}
	defer rows.Close()

	emails := make([]string, 0, 64)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return internalError(c, "AdminNewsletterEmails scan", err)
		}
		emails = append(emails, email)
	}
	return c.JSON(fiber.Map{
		"emails":                 strings.Join(emails, ", "),
		"count":                  len(emails),
		"include_unsubscribed":   f.includeUnsubscribed,
		"excludes_unsubscribed":  !f.includeUnsubscribed,
	})
}

type adminNewsletterPatchRequest struct {
	Status string `json:"status"`
}

// AdminPatchNewsletter toggles subscribed/unsubscribed for a row.
func (h *Handler) AdminPatchNewsletter(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return badRequest(c, "id is required")
	}
	var req adminNewsletterPatchRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	status := strings.ToLower(strings.TrimSpace(req.Status))
	if status != "subscribed" && status != "unsubscribed" {
		return badRequest(c, "status must be subscribed or unsubscribed")
	}

	var setSQL string
	if status == "unsubscribed" {
		setSQL = `
			UPDATE newsletter_subscribers
			SET status = 'unsubscribed',
			    unsubscribed_at = COALESCE(unsubscribed_at, now()),
			    updated_at = now()
			WHERE id = $1
			RETURNING id, email, source, status, created_at, unsubscribed_at`
	} else {
		setSQL = `
			UPDATE newsletter_subscribers
			SET status = 'subscribed',
			    unsubscribed_at = NULL,
			    updated_at = now()
			WHERE id = $1
			RETURNING id, email, source, status, created_at, unsubscribed_at`
	}

	var email, source, curStatus string
	var createdAt time.Time
	var unsubAt pgtype.Timestamptz
	err := h.db.QueryRow(c.Context(), setSQL, id).Scan(&id, &email, &source, &curStatus, &createdAt, &unsubAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "subscriber not found")
	}
	if err != nil {
		return internalError(c, "AdminPatchNewsletter", err)
	}

	var userID, userName, custName pgtype.Text
	var custRegistered pgtype.Bool
	_ = h.db.QueryRow(c.Context(), `
		SELECT usr.id::text, usr.full_name, cust.full_name, cust.is_registered
		FROM (SELECT $1::text AS email) e
		LEFT JOIN LATERAL (
			SELECT c.full_name, (NOT c.is_guest) AS is_registered
			FROM customers c
			WHERE c.email IS NOT NULL AND lower(c.email) = lower(e.email)
			ORDER BY c.is_guest ASC, c.created_at DESC
			LIMIT 1
		) cust ON true
		LEFT JOIN LATERAL (
			SELECT u.id, u.full_name
			FROM users u
			WHERE lower(u.email) = lower(e.email)
			ORDER BY u.created_at DESC
			LIMIT 1
		) usr ON true`, email,
	).Scan(&userID, &userName, &custName, &custRegistered)

	return c.JSON(scanNewsletterRow(id, email, source, curStatus, createdAt, unsubAt, userID, userName, custName, custRegistered))
}

// UnsubscribeNewsletter handles GET|POST /api/newsletter/unsubscribe?token=
func (h *Handler) UnsubscribeNewsletter(c *fiber.Ctx) error {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		var body struct {
			Token string `json:"token"`
		}
		_ = c.BodyParser(&body)
		token = strings.TrimSpace(body.Token)
	}
	if token == "" {
		return badRequest(c, "token is required")
	}

	var id string
	var status string
	err := h.db.QueryRow(c.Context(), `
		UPDATE newsletter_subscribers
		SET status = 'unsubscribed',
		    unsubscribed_at = COALESCE(unsubscribed_at, now()),
		    updated_at = now()
		WHERE unsubscribe_token = $1
		RETURNING id, status`, token).Scan(&id, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "invalid or unknown unsubscribe token")
	}
	if err != nil {
		return internalError(c, "UnsubscribeNewsletter", err)
	}
	return c.JSON(fiber.Map{
		"ok":     true,
		"status": status,
		"id":     id,
	})
}
