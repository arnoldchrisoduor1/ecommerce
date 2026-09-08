'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { AdminApiError, adminGet, adminSend, slugify } from '@/lib/admin';
import { Button } from '@/components/ui';

type Product = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  status: string;
};

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
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !productId) return;
    void adminGet<Product & { variants?: { id: string }[] }>(`/products/${productId}`).then(
      (p) => {
        setName(p.name);
        setPrice(String(p.base_price));
      },
    );
  }, [ready, productId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let slug = slugify(name);
      const basePrice = Number(price);
      if (productId) {
        await adminSend(`/products/${productId}`, 'PUT', {
          name,
          slug,
          base_price: basePrice,
          status: 'active',
        });
      } else {
        let created: { id: string };
        try {
          created = await adminSend<{ id: string }>('/products', 'POST', {
            name,
            slug,
            base_price: basePrice,
            status: 'active',
          });
        } catch (err) {
          if (err instanceof AdminApiError && err.status === 400) {
            slug = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
            created = await adminSend<{ id: string }>('/products', 'POST', {
              name,
              slug,
              base_price: basePrice,
              status: 'active',
            });
          } else {
            throw err;
          }
        }
        await adminSend(`/products/${created.id}/variants`, 'POST', {
          sku: `${slug}-default`.slice(0, 40),
          stock_qty: 10,
          low_stock_threshold: 3,
        });
      }
      toast('Product saved', 'product-saved-toast');
    } catch {
      toast('Could not save product');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title={productId ? 'Edit product' : 'New product'}>
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Name</span>
          <input
            className="admin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="product-name"
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Price (KES)</span>
          <input
            className="admin-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            data-testid="product-price"
            required
          />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-product">
          Save product
        </Button>
      </form>
    </AdminShell>
  );
}
