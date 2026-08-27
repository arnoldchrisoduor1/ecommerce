package mpesa

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Config struct {
	ConsumerKey    string
	ConsumerSecret string
	Shortcode      string
	Passkey        string
	CallbackURL    string
	BaseURL        string
}

func LoadConfigFromEnv() (Config, error) {
	cfg := Config{
		ConsumerKey:    os.Getenv("MPESA_CONSUMER_KEY"),
		ConsumerSecret: os.Getenv("MPESA_CONSUMER_SECRET"),
		Shortcode:      os.Getenv("MPESA_SHORTCODE"),
		Passkey:        os.Getenv("MPESA_PASSKEY"),
		CallbackURL:    os.Getenv("MPESA_CALLBACK_URL"),
	}
	if cfg.ConsumerKey == "" || cfg.ConsumerSecret == "" || cfg.Shortcode == "" || cfg.Passkey == "" || cfg.CallbackURL == "" {
		return cfg, fmt.Errorf("missing one or more MPESA_* env vars")
	}

	env := strings.ToLower(os.Getenv("MPESA_ENV"))
	if env == "production" {
		cfg.BaseURL = "https://api.safaricom.co.ke"
	} else {
		cfg.BaseURL = "https://sandbox.safaricom.co.ke"
	}
	return cfg, nil
}

type Client struct {
	cfg        Config
	httpClient *http.Client
	token      string
	tokenExp   time.Time
	mu         sync.Mutex
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) accessToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExp) {
		return c.token, nil
	}

	req, err := http.NewRequest(http.MethodGet, c.cfg.BaseURL+"/oauth/v1/generate?grant_type=client_credentials", nil)
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(c.cfg.ConsumerKey, c.cfg.ConsumerSecret)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth token request failed (%d): %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   string `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("oauth response missing access_token")
	}

	c.token = parsed.AccessToken
	c.tokenExp = time.Now().Add(50 * time.Minute)
	return c.token, nil
}

type STKPushRequest struct {
	Phone            string
	Amount           int
	AccountReference string
	Description      string
}

type STKPushResponse struct {
	MerchantRequestID   string `json:"MerchantRequestID"`
	CheckoutRequestID   string `json:"CheckoutRequestID"`
	ResponseCode        string `json:"ResponseCode"`
	ResponseDescription string `json:"ResponseDescription"`
	CustomerMessage     string `json:"CustomerMessage"`
	ErrorMessage        string `json:"errorMessage"`
}

func (c *Client) STKPush(req STKPushRequest) (*STKPushResponse, error) {
	token, err := c.accessToken()
	if err != nil {
		return nil, err
	}

	timestamp := time.Now().Format("20060102150405")
	password := base64.StdEncoding.EncodeToString([]byte(c.cfg.Shortcode + c.cfg.Passkey + timestamp))

	payload := map[string]any{
		"BusinessShortCode": c.cfg.Shortcode,
		"Password":          password,
		"Timestamp":         timestamp,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            req.Amount,
		"PartyA":            req.Phone,
		"PartyB":            c.cfg.Shortcode,
		"PhoneNumber":       req.Phone,
		"CallBackURL":       c.cfg.CallbackURL,
		"AccountReference":  req.AccountReference,
		"TransactionDesc":   req.Description,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, c.cfg.BaseURL+"/mpesa/stkpush/v1/processrequest", bytes.NewReader(jsonData))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var out STKPushResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("decode stk response: %w (body: %s)", err, string(body))
	}
	if out.ErrorMessage != "" {
		return &out, fmt.Errorf("daraja stk error: %s", out.ErrorMessage)
	}
	if out.ResponseCode != "" && out.ResponseCode != "0" {
		return &out, fmt.Errorf("daraja stk rejected: %s", out.ResponseDescription)
	}
	if out.CheckoutRequestID == "" {
		return &out, fmt.Errorf("daraja stk missing CheckoutRequestID (body: %s)", string(body))
	}
	return &out, nil
}
