# Ecommerce platform — consolidated feature list

Client: single-brand fashion storefront (women's basics — tees, tanks, bodysuits, knitwear, bundles)
Stack: Go/Fiber + Next.js + PostgreSQL + Redis + MinIO + Docker, Nginx/Certbot on Lightsail

---

## 1. Landing page
- Rotating announcement bar above main nav (perks, drop cadence, promos, legal notice) — auto-rotating, multi-message
- Top nav: logo, category links, search, wishlist, cart icons
- Instagram-style highlights reel (tappable circular stories) below nav
- Hero banner / promo section
- New arrivals grid
- Customer favourites / featured picks section
- Style guide / blog feed preview
- Sitewide stats counter (e.g. total items sold to date)
- Instagram handle/social feed section
- Email capture with social-proof framing (e.g. "N already joined" + avatar stack)

## 2. Category / shop pages
- Grid/list view toggle
- Filters: size, color, price range, category
- Sort controls: recommended, latest, price ascending/descending, random
- Infinite scroll or pagination
- Quick-view modal (preview without leaving grid)
- Per-product live viewer count badge ("N viewing")
- "High demand" tag when viewer count crosses a threshold
- Sale price display (strikethrough original + discounted price)
- Stock status label (in stock / low stock / sold out)
- Bundle badge for multi-item bundle products

## 3. Product detail page (PDP)
- Image gallery with thumbnails, multiple angles/colors
- Size/color variant selector with live stock status
- Size chart modal
- Live viewer count + "high demand" indicator
- Price, sale price, stock status
- "Complete the look" / related products
- Add to bag, buy now, save for later / wishlist
- Virtual try-on entry point (scope as photo-based fit preview for v1; true AR/fit-simulation is a larger, separate build)
- Reviews section
- Trust badges: secure checkout (SSL), return/exchange window, delivery time with named courier partner
- Payment method badges (M-Pesa, Airtel Money, Visa, Mastercard)

## 4. Product bundles
- Grouped multi-item sets sold as a single SKU at a fixed bundle price
- Bundle detail view listing component items included
- Separate bundle badge/tag in grid and PDP

## 5. AI shopping assistant ("stylist" chat)
- Floating persistent chat widget, site-wide
- Dedicated nav entry point ("shop with stylist")
- Outfit recommendations, styling Q&A, product lookup/comparison within chat
- Optional add-to-cart directly from chat
- Style quiz ("style DNA" equivalent) for personalized recommendations, feeding chat context

## 6. Cart & urgency features
- Persistent mini-cart (slide-out drawer)
- Quantity edit, remove, move-to-wishlist from cart
- Exit-intent modal: discount code + live "claimed today" counter
- Free shipping / discount progress bar
- Sitewide recent-purchase notification ticker ("name just bought [product] · time ago") — distinct from per-product viewer count, seeded from real order events

## 7. Checkout
- Guest checkout + account option
- Shipping address + delivery zone/cost calculation
- Real-time delivery quote via courier partner integration
- M-Pesa STK push (Daraja API) as primary payment
- Card payment as secondary (Pesapay/Flutterwave)
- Order summary + promo code field
- Order confirmation page + email/SMS receipt

## 8. Customer account
- Order history and tracking status
- Saved addresses and payment preference
- Wishlist
- Gift card purchase and redemption
- Account settings

## 9. Content / blog layer
- Style guide / comparison posts (Product A vs Product B format)
- SEO-optimized articles linking back to PDPs
- Category landing content (curated roundups)
- Shoppable video content

## 10. Support & trust
- WhatsApp support entry point
- FAQ / help center
- Order tracking (standalone, pre-login)
- App download promotion

## 11. Admin dashboard
- Product/inventory management (CRUD, stock levels, variants, bundles)
- Order management (status updates, fulfillment)
- Discount code management + claim/redemption tracking
- Analytics dashboard (views, conversion, top products)
- Blog/content editor
- Customer list
- Recent-purchase ticker data source (real order feed, not fabricated)

## 12. Storefront content management (CMS)
Admin-editable content so non-technical staff can update the storefront without a deploy:
- Hero section: image/video, headline, CTA link — swappable per campaign
- Announcement bar: manage the rotating message list, order, and active/inactive state
- Highlights reel: add/remove/reorder story items, each with its own media + linked content
- Featured/curated product shelves (new arrivals, customer favourites, "complete the look" sets) — manual curation, not just auto-generated
- Featured reviews: pick which reviews surface on PDP or homepage, reorder, hide/unhide
- Style guide / blog posts: create, edit, publish, schedule
- Email capture module copy and social-proof counters (editable stats, not hardcoded)
- Footer links and sections
- Sitewide stats counters (e.g. total items sold) — either manual override or auto-calculated with manual override option
- Discount/exit-intent modal copy and offer parameters (percentage, active dates)

This effectively means the admin dashboard needs a lightweight CMS layer, not just inventory/order management — worth modeling as its own set of tables (content blocks, curated shelves, review flags) separate from the product/order schema.

## 13. Infra & non-functional
- SSL, PCI-conscious payment handling (never store raw card data)
- CDN/image optimization for product photos
- SEO metadata, sitemap, structured data (schema.org Product)
- Mobile-first responsive design
- Analytics (GA4/Meta Pixel) for marketing attribution
- Live viewer count / presence tracking (Redis pub/sub or polling)

---

## Scope flags for planning
- **Virtual try-on**: decide early whether v1 ships a lightweight version (per-size/color model photos) or a true AR/fit-simulation feature — significant timeline difference.
- **Recent purchase notifications**: build on real order data from day one rather than patching in fake data later.
- **Bundles**: need their own data model (bundle → component SKUs → fixed price) distinct from single-product variants.