package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"ecommerce-backend/internal/mpesa"
)

type initiateMpesaRequest struct {
	OrderID string `json:"order_id"`
	Phone   string `json:"phone"`
}

type mpesaCallbackPayload struct {
	Body struct {
		StkCallback struct {
			MerchantRequestID string `json:"MerchantRequestID"`
			CheckoutRequestID string `json:"CheckoutRequestID"`
			ResultCode        int    `json:"ResultCode"`
			ResultDesc        string `json:"ResultDesc"`
			CallbackMetadata  *struct {
				Item []struct {
					Name  string `json:"Name"`
					Value any    `json:"Value"`
				} `json:"Item"`
			} `json:"CallbackMetadata"`
		} `json:"stkCallback"`
	} `json:"Body"`
}

func normalizeKenyaPhone(phone string) (string, error) {
	p := strings.TrimSpace(phone)
	p = strings.TrimPrefix(p, "+")
	if strings.HasPrefix(p, "0") && len(p) == 10 {
		return "254" + p[1:], nil
	}
	if strings.HasPrefix(p, "254") && len(p) == 12 {
		return p, nil
	}
	return "", fmt.Errorf("phone must be Kenyan format 2547XXXXXXXX or 07XXXXXXXX")
}

func (h *Handler) mpesaClient() (*mpesa.Client, error) {
	cfg, err := mpesa.LoadConfigFromEnv()
	if err != nil {
		return nil, err
	}
	return mpesa.NewClient(cfg), nil
}

// InitiateMpesaSTK starts a Daraja STK push for an unpaid order.
func (h *Handler) InitiateMpesaSTK(c *fiber.Ctx) error {
	var req initiateMpesaRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body")
	}
	if req.OrderID == "" || req.Phone == "" {
		return badRequest(c, "order_id and phone are required")
	}

	phone, err := normalizeKenyaPhone(req.Phone)
	if err != nil {
		return badRequest(c, err.Error())
	}

	var orderTotal float64
	var paymentStatus string
	var orderStatus string
	err = h.db.QueryRow(c.Context(), `
		SELECT total, payment_status, status FROM orders WHERE id = $1`, req.OrderID,
	).Scan(&orderTotal, &paymentStatus, &orderStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "order not found")
	}
	if err != nil {
		return internalError(c, "InitiateMpesaSTK load order", err)
	}
	if paymentStatus == "paid" || orderStatus == "paid" {
		return badRequest(c, "order is already paid")
	}

	amount := int(math.Round(orderTotal))
	if amount < 1 {
		return badRequest(c, "order total must be at least 1 KES")
	}

	client, err := h.mpesaClient()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "mpesa not configured",
		})
	}

	ref := req.OrderID
	if len(ref) > 12 {
		ref = ref[:12]
	}

	stkResp, err := client.STKPush(mpesa.STKPushRequest{
		Phone:            phone,
		Amount:           amount,
		AccountReference: ref,
		Description:      "Order payment",
	})
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	var paymentID string
	err = h.db.QueryRow(c.Context(), `
		INSERT INTO payments (order_id, provider, provider_ref, amount, status)
		VALUES ($1, 'mpesa', $2, $3, 'initiated')
		RETURNING id`, req.OrderID, stkResp.CheckoutRequestID, orderTotal,
	).Scan(&paymentID)
	if err != nil {
		return internalError(c, "InitiateMpesaSTK insert payment", err)
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"payment_id":          paymentID,
		"checkout_request_id": stkResp.CheckoutRequestID,
		"merchant_request_id": stkResp.MerchantRequestID,
		"customer_message":    stkResp.CustomerMessage,
	})
}

func verifyMpesaCallbackPayload(p mpesaCallbackPayload) error {
	cb := p.Body.StkCallback
	if cb.CheckoutRequestID == "" {
		return errors.New("missing CheckoutRequestID")
	}
	if cb.MerchantRequestID == "" {
		return errors.New("missing MerchantRequestID")
	}
	return nil
}

// MpesaCallback handles Daraja STK push result webhooks.
func (h *Handler) MpesaCallback(c *fiber.Ctx) error {
	var payload mpesaCallbackPayload
	if err := c.BodyParser(&payload); err != nil {
		return badRequest(c, "invalid callback payload")
	}
	if err := verifyMpesaCallbackPayload(payload); err != nil {
		return badRequest(c, err.Error())
	}

	cb := payload.Body.StkCallback
	raw, err := json.Marshal(payload)
	if err != nil {
		return internalError(c, "MpesaCallback marshal payload", err)
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return internalError(c, "MpesaCallback begin tx", err)
	}
	defer tx.Rollback(c.Context())

	var paymentID, orderID, currentStatus string
	err = tx.QueryRow(c.Context(), `
		SELECT p.id, p.order_id, p.status
		FROM payments p
		WHERE p.provider = 'mpesa' AND p.provider_ref = $1
		FOR UPDATE`, cb.CheckoutRequestID,
	).Scan(&paymentID, &orderID, &currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c, "payment not found for CheckoutRequestID")
	}
	if err != nil {
		return internalError(c, "MpesaCallback load payment", err)
	}

	if currentStatus == "completed" || currentStatus == "failed" {
		return c.JSON(fiber.Map{"ResultCode": 0, "ResultDesc": "already processed"})
	}

	if cb.ResultCode == 0 {
		_, err = tx.Exec(c.Context(), `
			UPDATE payments SET status = 'completed', raw_payload = $1
			WHERE id = $2`, raw, paymentID)
		if err != nil {
			return internalError(c, "MpesaCallback update payment success", err)
		}
		_, err = tx.Exec(c.Context(), `
			UPDATE orders SET payment_status = 'paid', status = 'paid', updated_at = now()
			WHERE id = $1`, orderID)
		if err != nil {
			return internalError(c, "MpesaCallback update order success", err)
		}
	} else {
		_, err = tx.Exec(c.Context(), `
			UPDATE payments SET status = 'failed', raw_payload = $1
			WHERE id = $2`, raw, paymentID)
		if err != nil {
			return internalError(c, "MpesaCallback update payment failure", err)
		}
		_, err = tx.Exec(c.Context(), `
			UPDATE orders SET payment_status = 'failed', updated_at = now()
			WHERE id = $1`, orderID)
		if err != nil {
			return internalError(c, "MpesaCallback update order failure", err)
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return internalError(c, "MpesaCallback commit", err)
	}

	return c.JSON(fiber.Map{"ResultCode": 0, "ResultDesc": "callback accepted"})
}
