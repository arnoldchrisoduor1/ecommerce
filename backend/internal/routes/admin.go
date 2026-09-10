package routes

import (
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
	api := app.Group("/api/admin")

	// Public — issues JWT used by RequireAdminAuth below.
	api.Post("/login", h.AdminLogin)

	admin := api.Group("", middleware.RequireAdminAuth())

	// --- Overview ---
	admin.Get("/overview", h.AdminOverview) // orders today, revenue, active viewers, discount claims

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
	admin.Get("/analytics/top-products", h.AdminTopProducts)
	admin.Get("/analytics/low-stock", h.AdminLowStockAlerts)
}
