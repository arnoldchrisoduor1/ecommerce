package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"ecommerce-backend/internal/handlers"
)

// RegisterPublicRoutes wires up every storefront-facing endpoint.
// Grouped to mirror the feature list sections so it's easy to cross-
// reference against docs/SPEC.md while implementing handlers.
func RegisterPublicRoutes(app *fiber.App, db *pgxpool.Pool, rdb *redis.Client) {
	h := handlers.New(db, rdb)
	api := app.Group("/api")

	// --- Section 2/3: Catalog (categories, products, variants) ---
	catalog := api.Group("/catalog")
	catalog.Get("/categories", h.ListCategories)
	catalog.Get("/products", h.ListProducts)               // supports ?category=&sort=&size=&color=&min_price=&max_price=
	catalog.Get("/products/:slug", h.GetProductBySlug)
	catalog.Get("/products/:slug/related", h.GetRelatedProducts)
	catalog.Get("/bundles/:slug", h.GetBundleBySlug)

	// --- Live viewer / presence tracking (Redis-backed) ---
	presence := api.Group("/presence")
	presence.Post("/products/:id/heartbeat", h.PresenceHeartbeat) // client pings every ~15s
	presence.Get("/products/:id", h.PresenceCount)

	// --- Section 6: Cart ---
	cart := api.Group("/cart")
	cart.Post("/", h.CreateCart)
	cart.Get("/:id", h.GetCart)
	cart.Post("/:id/items", h.AddCartItem)
	cart.Patch("/:id/items/:itemId", h.UpdateCartItem)
	cart.Delete("/:id/items/:itemId", h.RemoveCartItem)

	// --- Section 7: Checkout & Payments ---
	checkout := api.Group("/checkout")
	checkout.Post("/quote", h.DeliveryQuote) // courier partner integration
	checkout.Post("/", h.CreateOrder)

	payments := api.Group("/payments")
	payments.Post("/mpesa/stk", h.InitiateMpesaSTK)
	payments.Post("/mpesa/callback", h.MpesaCallback) // webhook, no auth, verify signature/IP instead
	payments.Post("/card/initiate", h.InitiateCardPayment)

	// --- Section 8: Customer account ---
	account := api.Group("/account") // TODO: wrap with customer auth middleware
	account.Get("/orders", h.ListMyOrders)
	account.Get("/orders/:id", h.GetMyOrder)
	account.Get("/wishlist", h.GetWishlist)
	account.Post("/wishlist/:productId", h.AddToWishlist)
	account.Delete("/wishlist/:productId", h.RemoveFromWishlist)
	account.Get("/addresses", h.ListAddresses)
	account.Post("/addresses", h.CreateAddress)

	// Standalone order tracking, no login required (order id + phone/email)
	api.Get("/orders/track", h.TrackOrder)

	// Gift cards
	gift := api.Group("/gift-cards")
	gift.Post("/purchase", h.PurchaseGiftCard)
	gift.Get("/:code", h.GetGiftCard)
	gift.Post("/redeem", h.RedeemGiftCard)

	// --- Discounts (exit-intent + general) ---
	discounts := api.Group("/discounts")
	discounts.Get("/:code", h.GetDiscount)
	discounts.Post("/:code/claim", h.ClaimDiscount)
	discounts.Get("/:code/claims-today", h.DiscountClaimsToday) // "N people claimed this today"

	// --- Reviews ---
	reviews := api.Group("/reviews")
	reviews.Get("/featured", h.ListFeaturedReviews)
	reviews.Get("/product/:productId", h.ListProductReviews)
	reviews.Post("/product/:productId", h.SubmitReview) // goes to pending, admin approves

	// --- Section 5: AI stylist chat ---
	stylist := api.Group("/stylist")
	stylist.Post("/chat", h.StylistChat)          // streams via Claude API, product-catalog-aware
	stylist.Post("/style-quiz", h.SubmitStyleQuiz) // returns personalized picks

	// --- Section 9: Content / blog ---
	content := api.Group("/content")
	content.Get("/blocks/:key", h.GetContentBlock) // hero, announcement_bar, footer
	content.Get("/highlights", h.ListHighlights)
	content.Get("/shelves/:key", h.GetCuratedShelf) // new_arrivals, customer_favourites
	content.Get("/blog", h.ListBlogPosts)
	content.Get("/blog/:slug", h.GetBlogPost)
	content.Get("/stats", h.GetStatsCounters)

	// --- Recent purchase notification feed (sitewide social proof) ---
	api.Get("/activity/recent-purchases", h.RecentPurchases)
}
