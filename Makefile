.PHONY: migrate migrate-info migrate-validate seed sync-design

migrate:
	docker compose run --rm flyway migrate

migrate-info:
	docker compose run --rm flyway info

migrate-validate:
	docker compose run --rm flyway validate

seed:
	docker compose exec -T postgres psql -U ecommerce -d ecommerce -f /dev/stdin < db/seed.sql

# Copy design-system CSS into the Next.js app (Turbopack cannot import outside frontend/)
sync-design:
	mkdir -p frontend/src/styles
	cp design-system/ecommerce-storefront/tokens.css frontend/src/styles/tokens.css
	cp design-system/ecommerce-storefront/components.css frontend/src/styles/components.css
