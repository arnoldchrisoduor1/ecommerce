package routes

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"ecommerce-backend/internal/handlers"
	"ecommerce-backend/internal/middleware"
	"ecommerce-backend/internal/storage"
)

// RegisterAdminRoutes wires up every admin-dashboard endpoint, all behind
// admin auth. Mirrors feature list section 11 (admin dashboard) and 12
// (CMS/content control).
func RegisterAdminRoutes(app *fiber.App, db *pgxpool.Pool, rdb *redis.Client, store *storage.Client) {
	h := handlers.New(db, rdb, store)
	if err := h.EnsureAdminCredentials(context.Background()); err != nil {
		log.Printf("admin credentials seed: %v", err)
	}
	if err := h.EnsureAISettings(context.Background()); err != nil {
		log.Printf("ai settings seed: %v", err)
	}
	api := app.Group("/api/admin")

	// Public — issues JWT used by RequireAdminAuth below.
	api.Post("/login", h.AdminLogin)

	admin := api.Group("", middleware.RequireAdminAuth())

	// --- Settings (Task 35) ---
	admin.Get("/settings", h.AdminGetSettings)
	admin.Post("/settings/password/code", h.AdminRequestPasswordChangeCode)
	admin.Put("/settings/password", h.AdminChangePassword)

	// --- Overview ---
	admin.Get("/overview", h.AdminOverview) // orders today, revenue, active viewers, discount claims

	// --- Categories ---
	categories := admin.Group("/categories")
	categories.Get("/", h.AdminListCategories)
	categories.Post("/", h.AdminCreateCategory)
	categories.Put("/reorder", h.AdminReorderCategories)
	categories.Put("/:id", h.AdminUpdateCategory)
	categories.Delete("/:id", h.AdminDeleteCategory)

	// --- Products & variants ---
	products := admin.Group("/products")
	products.Get("/", h.AdminListProducts)
	products.Post("/", h.AdminCreateProduct)
	products.Get("/:id", h.AdminGetProduct)
	products.Put("/:id", h.AdminUpdateProduct)
	products.Delete("/:id", h.AdminDeleteProduct)
	products.Post("/:id/variants", h.AdminCreateVariant)
	products.Put("/:id/variants/:variantId", h.AdminUpdateVariant)
	products.Delete("/:id/variants/:variantId", h.AdminDeleteVariant)
	products.Post("/:id/images", h.AdminAddProductImage) // attach URL from /content/media
	products.Put("/:id/images/reorder", h.AdminReorderProductImages)
	products.Patch("/:id/images/:imageId", h.AdminUpdateProductImage)
	products.Delete("/:id/images/:imageId", h.AdminDeleteProductImage)

	// --- Bundles ---
	bundles := admin.Group("/bundles")
	bundles.Get("/", h.AdminListBundles)
	bundles.Post("/", h.AdminCreateBundle)
	bundles.Put("/:id", h.AdminUpdateBundle)
	bundles.Delete("/:id", h.AdminDeleteBundle)

	// --- Orders ---
	orders := admin.Group("/orders")
	orders.Get("/", h.AdminListOrders)
	orders.Get("/:id", h.AdminGetOrder)
	orders.Patch("/:id/status", h.AdminUpdateOrderStatus)
	orders.Patch("/:id/delivery-estimate", h.AdminUpdateOrderDeliveryEstimate)

	// --- Discounts ---
	discounts := admin.Group("/discounts")
	discounts.Get("/", h.AdminListDiscounts)
	discounts.Post("/", h.AdminCreateDiscount)
	discounts.Put("/:id", h.AdminUpdateDiscount)
	discounts.Delete("/:id", h.AdminDeleteDiscount)

	// --- Customers ---
	admin.Get("/customers", h.AdminListCustomers)
	admin.Get("/customers/:id", h.AdminGetCustomer)
	admin.Get("/saved-items", h.AdminListSavedItems)

	// --- Activity feed (Task 15) ---
	admin.Get("/activity/unread", h.AdminActivityUnread)
	admin.Post("/activity/mark-read", h.AdminMarkActivityRead)
	admin.Get("/activity", h.AdminActivityFeed)
	admin.Get("/activity/summary", h.AdminActivitySummary)
	admin.Get("/activity/export", h.AdminActivityExportCSV)

	// --- Newsletter subscribers (Task 16) ---
	admin.Get("/newsletter", h.AdminListNewsletter)
	admin.Get("/newsletter/stats", h.AdminNewsletterStats)
	admin.Get("/newsletter/export", h.AdminNewsletterExportCSV)
	admin.Get("/newsletter/emails", h.AdminNewsletterEmails)
	admin.Patch("/newsletter/:id", h.AdminPatchNewsletter)

	// --- Reviews (approve/feature) ---
	reviews := admin.Group("/reviews")
	reviews.Get("/", h.AdminListReviews)
	reviews.Patch("/:id/status", h.AdminUpdateReviewStatus) // approve/reject
	reviews.Patch("/:id/feature", h.AdminSetReviewFeatured)

	// --- CMS: content blocks, highlights, curated shelves, stats ---
	content := admin.Group("/content")
	content.Put("/blocks/:key", h.AdminUpdateContentBlock) // hero, announcement_bar, footer
	content.Post("/media", h.AdminUploadContentMedia)      // -> MinIO (CMS images)
	content.Get("/highlights", h.AdminListHighlights)
	content.Post("/highlights", h.AdminCreateHighlight)
	content.Put("/highlights/:id", h.AdminUpdateHighlight)
	content.Delete("/highlights/:id", h.AdminDeleteHighlight)
	content.Post("/highlights/:id/slides", h.AdminCreateHighlightSlide)
	content.Put("/highlights/:id/slides/reorder", h.AdminReorderHighlightSlides)
	content.Put("/highlights/:id/slides/:slideId", h.AdminUpdateHighlightSlide)
	content.Delete("/highlights/:id/slides/:slideId", h.AdminDeleteHighlightSlide)
	content.Put("/shelves/:key", h.AdminUpdateCuratedShelf) // set product list + order
	content.Put("/stats/:key", h.AdminSetStatsCounter)      // manual override

	// --- Blog ---
	blog := admin.Group("/blog")
	blog.Get("/", h.AdminListBlogPosts)
	blog.Post("/", h.AdminCreateBlogPost)
	blog.Get("/:id", h.AdminGetBlogPost)
	blog.Put("/:id", h.AdminUpdateBlogPost)
	blog.Delete("/:id", h.AdminDeleteBlogPost)

	// --- Analytics ---
	admin.Get("/analytics/top-products", h.AdminMostViewedProducts)
	admin.Get("/analytics/low-stock", h.AdminLowStockAlerts)
	admin.Get("/analytics/most-viewed-products", h.AdminMostViewedProducts)
	admin.Get("/analytics/most-viewed-products/:id/viewers", h.AdminProductViewers)
	admin.Get("/analytics/most-visited-pages", h.AdminMostVisitedPages)
	admin.Get("/analytics/traffic-presence", h.AdminTrafficPresence)
	admin.Get("/analytics/blog-reads", h.AdminBlogAnalytics)

	// --- AI usage (Task 38) ---
	ai := admin.Group("/ai-usage")
	ai.Get("/summary", h.AdminAIUsageSummary)
	ai.Get("/daily", h.AdminAIUsageDaily)
	ai.Get("/breakdown", h.AdminAIUsageBreakdown)
	ai.Get("/users", h.AdminAIUsageByUser)
	ai.Post("/refresh", h.AdminRefreshAIBalances)
	ai.Put("/global", h.AdminSetAIGlobalEnabled)
	ai.Patch("/users/:userId/access", h.AdminSetUserAIAccess)
}
