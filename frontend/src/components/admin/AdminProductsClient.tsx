'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import {
  AdminApiError,
  adminGet,
  adminSend,
  adminUpload,
  slugify,
} from '@/lib/admin';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui';

type ProductImage = {
  id: string;
  url: string;
  position: number;
  variant_id?: string | null;
};

type ProductVariant = {
  id: string;
  sku: string;
  size?: string | null;
  color?: string | null;
  stock_qty: number;
  price_override?: number | null;
  low_stock_threshold: number;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category_id?: string | null;
  material?: string | null;
  base_price: number;
  sale_price?: number | null;
  status: string;
  variants?: ProductVariant[];
  images?: ProductImage[];
  primary_image?: ProductImage | null;
};

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
};

type FlatCategory = { id: string; label: string };

function flattenCategories(nodes: CategoryNode[], prefix = ''): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, label });
    if (n.children?.length) {
      out.push(...flattenCategories(n.children, label));
    }
  }
  return out;
}

export function AdminProductsListClient() {
  const { ready } = useAdminUi();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ products: Product[] }>('/products').then((r) => setProducts(r.products));
  }, [ready]);

  return (
    <AdminShell title="Products">
      <Link href="/admin/products/new">
        <Button variant="primary" size="sm">
          New product
        </Button>
      </Link>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                {p.primary_image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.primary_image.url}
                    alt=""
                    className="admin-product-thumb"
                  />
                ) : (
                  <span className="admin-product-thumb admin-product-thumb--empty" />
                )}
              </td>
              <td>
                <Link href={`/admin/products/${p.id}`}>{p.name}</Link>
              </td>
              <td>{p.slug}</td>
              <td>{p.base_price}</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}

export function AdminProductFormClient({ productId }: { productId?: string }) {
  const { ready, toast } = useAdminUi();
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [status, setStatus] = useState('active');
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newStock, setNewStock] = useState('10');

  useEffect(() => {
    if (!ready) return;
    void apiGet<{ categories: CategoryNode[] }>('/catalog/categories').then((r) => {
      setCategories(flattenCategories(r.categories || []));
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !productId) return;
    void adminGet<Product>(`/products/${productId}`).then((p) => {
      setName(p.name);
      setSlug(p.slug);
      setSlugTouched(true);
      setDescription(p.description || '');
      setMaterial(p.material || '');
      setCategoryId(p.category_id || '');
      setPrice(String(p.base_price));
      setSalePrice(p.sale_price != null ? String(p.sale_price) : '');
      setStatus(p.status || 'active');
      setVariants(p.variants || []);
      setImages(p.images || []);
    });
  }, [ready, productId]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function productBody() {
    const basePrice = Number(price);
    const sale = salePrice.trim() === '' ? null : Number(salePrice);
    return {
      name,
      slug: slug || slugify(name),
      description: description.trim() || null,
      material: material.trim() || null,
      category_id: categoryId || null,
      base_price: basePrice,
      sale_price: sale != null && Number.isFinite(sale) ? sale : null,
      status,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = productBody();
      if (productId) {
        const updated = await adminSend<Product>(`/products/${productId}`, 'PUT', body);
        setVariants(updated.variants || []);
        setImages(updated.images || []);
        toast('Product saved', 'product-saved-toast');
      } else {
        let created: Product;
        try {
          created = await adminSend<Product>('/products', 'POST', body);
        } catch (err) {
          if (err instanceof AdminApiError && err.status === 400) {
            const retrySlug = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
            setSlug(retrySlug);
            created = await adminSend<Product>('/products', 'POST', {
              ...body,
              slug: retrySlug,
            });
          } else {
            throw err;
          }
        }
        await adminSend(`/products/${created.id}/variants`, 'POST', {
          sku: `${created.slug}-default`.slice(0, 40),
          stock_qty: 10,
          low_stock_threshold: 3,
        });
        toast('Product saved', 'product-saved-toast');
        router.push(`/admin/products/${created.id}`);
      }
    } catch {
      toast('Could not save product');
    } finally {
      setBusy(false);
    }
  }

  async function saveVariant(v: ProductVariant) {
    if (!productId) return;
    setBusy(true);
    try {
      const updated = await adminSend<Product>(
        `/products/${productId}/variants/${v.id}`,
        'PUT',
        {
          sku: v.sku,
          size: v.size || null,
          color: v.color || null,
          stock_qty: v.stock_qty,
          price_override: v.price_override ?? null,
          low_stock_threshold: v.low_stock_threshold,
        },
      );
      setVariants(updated.variants || []);
      toast('Variant saved');
    } catch {
      toast('Could not save variant');
    } finally {
      setBusy(false);
    }
  }

  async function addVariant(e: FormEvent) {
    e.preventDefault();
    if (!productId || !newSku.trim()) return;
    setBusy(true);
    try {
      const updated = await adminSend<Product>(`/products/${productId}/variants`, 'POST', {
        sku: newSku.trim(),
        size: newSize.trim() || null,
        color: newColor.trim() || null,
        stock_qty: Number(newStock) || 0,
        low_stock_threshold: 3,
      });
      setVariants(updated.variants || []);
      setNewSku('');
      setNewSize('');
      setNewColor('');
      setNewStock('10');
      toast('Variant added');
    } catch {
      toast('Could not add variant');
    } finally {
      setBusy(false);
    }
  }

  async function deleteVariant(variantId: string) {
    if (!productId) return;
    setBusy(true);
    try {
      const updated = await adminSend<Product>(
        `/products/${productId}/variants/${variantId}`,
        'DELETE',
      );
      setVariants(updated.variants || []);
      toast('Variant removed');
    } catch {
      toast('Could not remove variant');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!productId || !files?.length) return;
    setBusy(true);
    try {
      const uploaded: ProductImage[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', `products/${productId}`);
        const media = await adminUpload<{ url: string }>('/content/media', form);
        const img = await adminSend<ProductImage>(`/products/${productId}/images`, 'POST', {
          url: media.url,
        });
        uploaded.push(img);
      }
      setImages((prev) => [...prev, ...uploaded]);
      toast('Image uploaded');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 501) {
        toast('Image upload needs MinIO (set MINIO_ENDPOINT)');
      } else {
        toast('Upload failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteImage(imageId: string) {
    if (!productId) return;
    setBusy(true);
    try {
      await adminSend(`/products/${productId}/images/${imageId}`, 'DELETE');
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      toast('Image removed');
    } catch {
      toast('Could not remove image');
    } finally {
      setBusy(false);
    }
  }

  function updateVariantField(
    id: string,
    field: keyof ProductVariant,
    value: string | number,
  ) {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  }

  return (
    <AdminShell title={productId ? 'Edit product' : 'New product'}>
      <form className="admin-form admin-form--wide" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Name</span>
          <input
            className="admin-input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            data-testid="product-name"
            required
          />
        </label>

        <label className="admin-field">
          <span className="ds-label">Slug</span>
          <input
            className="admin-input"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </label>

        <label className="admin-field">
          <span className="ds-label">Description</span>
          <textarea
            className="admin-input admin-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </label>

        <label className="admin-field">
          <span className="ds-label">Material</span>
          <input
            className="admin-input"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          />
        </label>

        <label className="admin-field">
          <span className="ds-label">Category</span>
          <select
            className="admin-input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-inline-form">
          <label className="admin-field">
            <span className="ds-label">Price (KES)</span>
            <input
              className="admin-input"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="product-price"
              required
              type="number"
              min={0}
              step="0.01"
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">Sale price (KES)</span>
            <input
              className="admin-input"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              type="number"
              min={0}
              step="0.01"
              placeholder="Optional"
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">Status</span>
            <select
              className="admin-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-product">
          Save product
        </Button>
      </form>

      {productId ? (
        <>
          <section className="admin-panel" style={{ marginTop: 'var(--space-8)' }}>
            <div className="admin-panel__head">
              <h2>Images</h2>
            </div>
            <p className="ds-caption">
              Upload product photos. The first image is used in listings.
            </p>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              data-testid="product-image-upload"
              onChange={(e) => {
                void onUpload(e.target.files);
                e.target.value = '';
              }}
            />
            {images.length === 0 ? (
              <p className="ds-caption">No images yet.</p>
            ) : (
              <ul className="admin-hero-slides">
                {images.map((img) => (
                  <li key={img.id} className="admin-hero-slide">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="admin-hero-slide__img" />
                    <div className="admin-hero-slide__actions">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => void deleteImage(img.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <h2>Variants &amp; stock</h2>
            </div>
            {variants.length === 0 ? (
              <p className="ds-caption">No variants yet.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Size</th>
                    <th>Color</th>
                    <th>Stock</th>
                    <th>Low stock at</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <input
                          className="admin-input"
                          value={v.sku}
                          onChange={(e) => updateVariantField(v.id, 'sku', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          value={v.size || ''}
                          onChange={(e) => updateVariantField(v.id, 'size', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          value={v.color || ''}
                          onChange={(e) => updateVariantField(v.id, 'color', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          type="number"
                          min={0}
                          value={v.stock_qty}
                          onChange={(e) =>
                            updateVariantField(v.id, 'stock_qty', Number(e.target.value) || 0)
                          }
                          data-testid="variant-stock"
                        />
                      </td>
                      <td>
                        <input
                          className="admin-input"
                          type="number"
                          min={1}
                          value={v.low_stock_threshold}
                          onChange={(e) =>
                            updateVariantField(
                              v.id,
                              'low_stock_threshold',
                              Number(e.target.value) || 1,
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="admin-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => void saveVariant(v)}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy || variants.length <= 1}
                            onClick={() => void deleteVariant(v.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form className="admin-inline-form" style={{ marginTop: 'var(--space-4)' }} onSubmit={(e) => void addVariant(e)}>
              <input
                className="admin-input"
                placeholder="SKU"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                required
              />
              <input
                className="admin-input"
                placeholder="Size"
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
              />
              <input
                className="admin-input"
                placeholder="Color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
              />
              <input
                className="admin-input"
                type="number"
                min={0}
                placeholder="Stock"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                Add variant
              </Button>
            </form>
          </section>
        </>
      ) : (
        <p className="ds-caption" style={{ marginTop: 'var(--space-4)' }}>
          Save the product first to upload images and manage stock variants.
        </p>
      )}
    </AdminShell>
  );
}
