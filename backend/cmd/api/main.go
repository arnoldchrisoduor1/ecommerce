package main

import (
	"context"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"ecommerce-backend/internal/routes"
	"ecommerce-backend/internal/storage"
)

func main() {
	dbURL := mustEnv("DATABASE_URL")
	redisAddr := mustEnv("REDIS_ADDR")

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer dbPool.Close()

	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rdb.Close()

	store, err := storage.ConfigFromEnv()
	if err != nil {
		log.Fatalf("failed to init minio: %v", err)
	}
	if store == nil {
		log.Printf("MINIO_ENDPOINT unset — product image uploads will return 501")
	}

	app := fiber.New(fiber.Config{
		AppName:   "ecommerce-api",
		BodyLimit: 12 * 1024 * 1024, // product photo uploads
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: os.Getenv("CORS_ALLOW_ORIGINS"), // e.g. https://yourdomain.com
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	routes.RegisterPublicRoutes(app, dbPool, rdb, store)
	routes.RegisterAdminRoutes(app, dbPool, rdb, store)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var: %s", key)
	}
	return v
}
