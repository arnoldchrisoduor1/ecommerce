-- db/seed.sql — dev/demo seed data for backend task 12

BEGIN;

INSERT INTO categories (name, slug, position) VALUES
  ('Tees', 'tees', 1),
  ('Tanks', 'tanks', 2),
  ('Bodysuits', 'bodysuits', 3),
  ('Knitwear', 'knitwear', 4)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position;

INSERT INTO products (name, slug, description, category_id, material, base_price, sale_price, status)
SELECT v.name, v.slug, v.description, c.id, v.material, v.base_price, v.sale_price, 'active'
FROM (VALUES
  ('Essential Crew Tee', 'essential-crew-tee', 'Soft everyday crew neck.', 'tees', 'Cotton', 1299::numeric, 999::numeric),
  ('Classic V-Neck Tee', 'classic-vneck-tee', 'Lightweight v-neck.', 'tees', 'Cotton', 1399, NULL),
  ('Oversized Tee', 'oversized-tee', 'Relaxed fit tee.', 'tees', 'Cotton', 1599, 1299),
  ('Ribbed Tank', 'ribbed-tank', 'Slim ribbed tank.', 'tanks', 'Cotton', 899, NULL),
  ('Square Neck Tank', 'square-neck-tank', 'Square neckline tank.', 'tanks', 'Cotton', 999, 799),
  ('Longline Tank', 'longline-tank', 'Extended length tank.', 'tanks', 'Cotton', 1099, NULL),
  ('Scoop Bodysuit', 'scoop-bodysuit', 'Snap closure bodysuit.', 'bodysuits', 'Cotton blend', 1899, 1599),
  ('Turtleneck Bodysuit', 'turtleneck-bodysuit', 'Long sleeve bodysuit.', 'bodysuits', 'Cotton blend', 2199, NULL),
  ('Fine Knit Sweater', 'fine-knit-sweater', 'Lightweight knit.', 'knitwear', 'Merino blend', 3499, 2999),
  ('Cropped Cardigan', 'cropped-cardigan', 'Button-front cardigan.', 'knitwear', 'Cotton knit', 3299, NULL),
  ('Striped Tee', 'striped-tee', 'Breton stripe tee.', 'tees', 'Cotton', 1499, NULL),
  ('Pocket Tee', 'pocket-tee', 'Chest pocket detail.', 'tees', 'Cotton', 1399, 1199),
  ('Racerback Tank', 'racerback-tank', 'Active racerback.', 'tanks', 'Cotton', 849, NULL),
  ('High Neck Tank', 'high-neck-tank', 'Mock neck tank.', 'tanks', 'Cotton', 949, NULL),
  ('Thong Bodysuit', 'thong-bodysuit', 'Seamless thong back.', 'bodysuits', 'Nylon blend', 1999, NULL),
  ('Wrap Bodysuit', 'wrap-bodysuit', 'Wrap front bodysuit.', 'bodysuits', 'Cotton blend', 2099, 1799),
  ('Cable Knit Vest', 'cable-knit-vest', 'Sleeveless knit vest.', 'knitwear', 'Wool blend', 2799, NULL),
  ('Mock Neck Knit', 'mock-neck-knit', 'Fitted mock neck.', 'knitwear', 'Cotton knit', 3199, NULL),
  ('Heavyweight Tee', 'heavyweight-tee', '220gsm cotton tee.', 'tees', 'Cotton', 1799, NULL),
  ('Linen Blend Tank', 'linen-blend-tank', 'Breathable linen tank.', 'tanks', 'Linen blend', 1199, 999)
) AS v(name, slug, description, cat_slug, material, base_price, sale_price)
JOIN categories c ON c.slug = v.cat_slug
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  material = EXCLUDED.material,
  base_price = EXCLUDED.base_price,
  sale_price = EXCLUDED.sale_price,
  status = 'active';

INSERT INTO product_variants (product_id, sku, size, color, stock_qty)
SELECT p.id, p.slug || '-M-BLK', 'M', 'Black', 50
FROM products p
WHERE p.slug IN (
  'essential-crew-tee','classic-vneck-tee','oversized-tee','ribbed-tank','square-neck-tank',
  'longline-tank','scoop-bodysuit','turtleneck-bodysuit','fine-knit-sweater','cropped-cardigan',
  'striped-tee','pocket-tee','racerback-tank','high-neck-tank','thong-bodysuit','wrap-bodysuit',
  'cable-knit-vest','mock-neck-knit','heavyweight-tee','linen-blend-tank'
)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color, stock_qty)
SELECT p.id, p.slug || '-L-WHT', 'L', 'White', 40
FROM products p
WHERE p.slug IN (
  'essential-crew-tee','classic-vneck-tee','oversized-tee','ribbed-tank','square-neck-tank',
  'longline-tank','scoop-bodysuit','turtleneck-bodysuit','fine-knit-sweater','cropped-cardigan',
  'striped-tee','pocket-tee','racerback-tank','high-neck-tank','thong-bodysuit','wrap-bodysuit',
  'cable-knit-vest','mock-neck-knit','heavyweight-tee','linen-blend-tank'
)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO product_images (product_id, url, position)
SELECT p.id, '/media/product.svg', 0
FROM products p
WHERE p.slug IN (
  'essential-crew-tee','classic-vneck-tee','oversized-tee','ribbed-tank','square-neck-tank',
  'longline-tank','scoop-bodysuit','turtleneck-bodysuit','fine-knit-sweater','cropped-cardigan',
  'striped-tee','pocket-tee','racerback-tank','high-neck-tank','thong-bodysuit','wrap-bodysuit',
  'cable-knit-vest','mock-neck-knit','heavyweight-tee','linen-blend-tank'
)
AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.position = 0);

INSERT INTO products (name, slug, description, base_price, is_bundle, status) VALUES
  ('Starter Essentials Bundle', 'starter-pack', 'Tee + tank combo.', 1899, true, 'active'),
  ('Layering Bundle', 'layering-bundle', 'Bodysuit + knit layer.', 4499, true, 'active')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, base_price = EXCLUDED.base_price, is_bundle = true, status = 'active';

INSERT INTO bundle_items (bundle_product_id, component_product_id, quantity)
SELECT b.id, p.id, v.qty FROM (VALUES
  ('starter-pack', 'essential-crew-tee', 1),
  ('starter-pack', 'ribbed-tank', 1),
  ('layering-bundle', 'scoop-bodysuit', 1),
  ('layering-bundle', 'fine-knit-sweater', 1)
) AS v(bundle_slug, product_slug, qty)
JOIN products b ON b.slug = v.bundle_slug AND b.is_bundle = true
JOIN products p ON p.slug = v.product_slug
WHERE NOT EXISTS (
  SELECT 1 FROM bundle_items bi WHERE bi.bundle_product_id = b.id AND bi.component_product_id = p.id
);

INSERT INTO discounts (code, type, value, max_claims, is_active, context) VALUES
  ('WELCOME10', 'percentage', 10, 100, true, 'exit_intent'),
  ('TESTCODE10', 'percentage', 10, 100, true, 'general')
ON CONFLICT (code) DO NOTHING;

INSERT INTO content_blocks (key, data, is_active) VALUES
  ('hero', '{"headline":"New season basics","subheadline":"Soft tees, tanks, and layers built for everyday","cta_label":"Shop new arrivals","cta_url":"/shop","media_url":"http://localhost:9000/ecommerce/cms/hero.jpg","media_urls":["http://localhost:9000/ecommerce/cms/hero.jpg","http://localhost:9000/ecommerce/cms/highlight-1.jpg","http://localhost:9000/ecommerce/cms/blog-tees.jpg"],"media_interval_ms":5500}', true),
  ('announcement_bar', '{"messages":["Free delivery over KES 3000","New drops every Thursday","Easy returns within 14 days"]}', true),
  ('footer', '{"columns":[{"title":"Shop","links":[{"label":"Tees","url":"/shop/tees"}]},{"title":"Support","links":[{"label":"FAQ","url":"/faq"}]}]}', true),
  ('delivery_estimate', '{"min_days":3,"max_days":8}', true)
ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO highlights (title, media_url, link_url, position, is_active)
SELECT v.title, v.media_url, v.link_url, v.position, true FROM (VALUES
  ('New drop', 'http://localhost:9000/ecommerce/cms/highlight-1.jpg', '/shop', 1),
  ('Style guide', 'http://localhost:9000/ecommerce/cms/highlight-2.jpg', '/blog', 2),
  ('Bundles', 'http://localhost:9000/ecommerce/cms/highlight-3.jpg', '/shop/bundles', 3)
) AS v(title, media_url, link_url, position)
WHERE NOT EXISTS (SELECT 1 FROM highlights h WHERE h.title = v.title);

INSERT INTO curated_shelves (key, title, is_active) VALUES
  ('new_arrivals', 'New Arrivals', true),
  ('customer_favourites', 'Customer Favourites', true)
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, is_active = true;

INSERT INTO curated_shelf_items (shelf_id, product_id, position)
SELECT cs.id, p.id, row_number() OVER ()
FROM curated_shelves cs
JOIN products p ON p.slug IN ('essential-crew-tee','oversized-tee','scoop-bodysuit','fine-knit-sweater')
WHERE cs.key = 'new_arrivals'
ON CONFLICT DO NOTHING;

INSERT INTO curated_shelf_items (shelf_id, product_id, position)
SELECT cs.id, p.id, row_number() OVER ()
FROM curated_shelves cs
JOIN products p ON p.slug IN ('ribbed-tank','classic-vneck-tee','cropped-cardigan')
WHERE cs.key = 'customer_favourites'
ON CONFLICT DO NOTHING;

INSERT INTO stats_counters (key, value, is_manual_override) VALUES
  ('items_sold_total', 12847, true)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO reviews (product_id, customer_name, rating, body, status, is_featured)
SELECT p.id, v.customer_name, v.rating, v.body, v.status, v.is_featured
FROM (VALUES
  ('essential-crew-tee', 'Amina K.', 5, 'Perfect fit and fabric.', 'approved', true),
  ('ribbed-tank', 'Grace M.', 4, 'Great everyday tank.', 'approved', true),
  ('scoop-bodysuit', 'Sarah W.', 5, 'Love the bodysuit snap.', 'approved', false),
  ('fine-knit-sweater', 'Linda O.', 5, 'Cozy knit for Nairobi evenings.', 'approved', true)
) AS v(product_slug, customer_name, rating, body, status, is_featured)
JOIN products p ON p.slug = v.product_slug
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.customer_name = v.customer_name
);

INSERT INTO blog_posts (title, slug, body, cover_image, status, published_at) VALUES
  (
    'How to build a capsule wardrobe',
    'capsule-wardrobe-guide',
    E'Start with neutral tees and tanks that layer cleanly.\n\nPick 2–3 base colors, one accent, and fabrics that wash well. A capsule works when every top pairs with at least two bottoms you already own.\n\nTry: essential crew tee, ribbed tank, fine knit sweater.',
    'http://localhost:9000/ecommerce/cms/blog-capsule.jpg',
    'published',
    now() - interval '12 days'
  ),
  (
    'Tee fits: crew, oversized, and heavyweight',
    'tee-fit-guide',
    E'Crew necks sit closest to classic — choose them for everyday polish.\n\nOversized cuts add ease through the shoulder; size down if you want structure without bulk.\n\nHeavyweight tees hold shape after washes and read more intentional under a jacket.',
    'http://localhost:9000/ecommerce/cms/blog-tees.jpg',
    'published',
    now() - interval '9 days'
  ),
  (
    'Layering tanks under knits',
    'tank-layering-tips',
    E'Tanks are the quiet foundation of warm-to-cool dressing.\n\nSquare and high necks peek cleanly under cardigans; racerbacks keep straps invisible under open knits.\n\nMatch tank length to your knit hem so nothing bunches at the waist.',
    'http://localhost:9000/ecommerce/cms/blog-tanks.jpg',
    'published',
    now() - interval '6 days'
  ),
  (
    'Bodysuit styling for all-day wear',
    'bodysuit-styling',
    E'A good bodysuit stays tucked without fighting you.\n\nScoop necks work under blazers; turtlenecks replace a separate base layer in cooler weather.\n\nPair with mid-rise trousers and you are set from desk to dinner.',
    'http://localhost:9000/ecommerce/cms/blog-bodysuit.jpg',
    'published',
    now() - interval '3 days'
  ),
  (
    'Knit textures for Nairobi evenings',
    'knit-evening-guide',
    E'Evenings cool quickly — fine knits and cropped cardigans bridge the gap without bulk.\n\nCable vests add texture over a tee; mock necks keep the neckline sharp under a coat.\n\nChoose breathable blends so you are not overheating indoors.',
    'http://localhost:9000/ecommerce/cms/blog-knits.jpg',
    'published',
    now() - interval '1 day'
  ),
  (
    'Color pairing: neutrals with one accent',
    'color-pairing-basics',
    E'Build most of the wardrobe in black, ivory, stone, and soft grey.\n\nAdd one recurring accent — rust, olive, or deep blue — so outfits feel intentional without matching sets.\n\nRepeat the accent in a tank, stripe, or knit so pieces talk to each other.',
    'http://localhost:9000/ecommerce/cms/blog-color.jpg',
    'published',
    now()
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  cover_image = EXCLUDED.cover_image,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at;

-- Demo customers + saved items (wishlist) for admin Saved items screen
INSERT INTO customers (email, phone, full_name, is_guest)
SELECT v.email, v.phone, v.full_name, false
FROM (VALUES
  ('amina@example.com', '0711111111', 'Amina K.'),
  ('grace@example.com', '0722222222', 'Grace M.'),
  ('linda@example.com', '0733333333', 'Linda O.')
) AS v(email, phone, full_name)
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.email = v.email);

INSERT INTO wishlist_items (customer_id, product_id)
SELECT c.id, p.id
FROM (VALUES
  ('amina@example.com', 'essential-crew-tee'),
  ('amina@example.com', 'fine-knit-sweater'),
  ('grace@example.com', 'ribbed-tank'),
  ('grace@example.com', 'oversized-tee'),
  ('grace@example.com', 'scoop-bodysuit'),
  ('linda@example.com', 'pocket-tee'),
  ('linda@example.com', 'cropped-cardigan')
) AS v(email, product_slug)
JOIN customers c ON c.email = v.email
JOIN products p ON p.slug = v.product_slug
WHERE NOT EXISTS (
  SELECT 1 FROM wishlist_items w WHERE w.customer_id = c.id AND w.product_id = p.id
);

COMMIT;
