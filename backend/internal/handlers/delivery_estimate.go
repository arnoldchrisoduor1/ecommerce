package handlers

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const deliveryEstimateBlockKey = "delivery_estimate"

type deliveryEstimateSettings struct {
	MinDays int `json:"min_days"`
	MaxDays int `json:"max_days"`
}

func defaultDeliveryEstimate() deliveryEstimateSettings {
	return deliveryEstimateSettings{MinDays: 3, MaxDays: 8}
}

func normalizeDeliveryEstimate(minDays, maxDays int) (int, int) {
	if minDays < 1 {
		minDays = 1
	}
	if maxDays < minDays {
		maxDays = minDays
	}
	return minDays, maxDays
}

func loadDeliveryEstimate(ctx context.Context, db *pgxpool.Pool) deliveryEstimateSettings {
	def := defaultDeliveryEstimate()
	var raw []byte
	err := db.QueryRow(ctx, `
		SELECT data FROM content_blocks WHERE key = $1 AND is_active = true`,
		deliveryEstimateBlockKey,
	).Scan(&raw)
	if err != nil {
		if err != pgx.ErrNoRows {
			// fall back silently — checkout should not fail if CMS row is missing
		}
		return def
	}
	var s deliveryEstimateSettings
	if json.Unmarshal(raw, &s) != nil {
		return def
	}
	s.MinDays, s.MaxDays = normalizeDeliveryEstimate(s.MinDays, s.MaxDays)
	return s
}

func formatDeliveryEstimateLabel(minDays, maxDays int) string {
	if minDays == maxDays {
		if minDays == 1 {
			return "1 business day"
		}
		return strconv.Itoa(minDays) + " business days"
	}
	return strconv.Itoa(minDays) + "–" + strconv.Itoa(maxDays) + " business days"
}
