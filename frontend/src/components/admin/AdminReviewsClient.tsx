'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

type Review = {
  id: string;
  product_name: string;
  customer_name: string;
  rating: number;
  body?: string | null;
  is_featured: boolean;
  status: string;
};

export function AdminReviewsClient() {
  const { ready, toast } = useAdminUi();
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ reviews: Review[] }>('/reviews').then((r) => setReviews(r.reviews));
  }, [ready]);

  async function toggleFeatured(id: string, featured: boolean) {
    await adminSend(`/reviews/${id}/feature`, 'PATCH', { is_featured: !featured });
    toast('Review updated', 'review-featured-toast');
    const r = await adminGet<{ reviews: Review[] }>('/reviews');
    setReviews(r.reviews);
  }

  async function setStatus(id: string, status: string) {
    await adminSend(`/reviews/${id}/status`, 'PATCH', { status });
    const r = await adminGet<{ reviews: Review[] }>('/reviews');
    setReviews(r.reviews);
  }

  return (
    <AdminShell title="Reviews">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Customer</th>
            <th>Rating</th>
            <th>Status</th>
            <th>Featured</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id}>
              <td>{r.product_name}</td>
              <td>{r.customer_name}</td>
              <td>{r.rating}</td>
              <td>{r.status}</td>
              <td>
                <Button
                  variant={r.is_featured ? 'accent' : 'secondary'}
                  size="sm"
                  data-testid="feature-review-toggle"
                  onClick={() => void toggleFeatured(r.id, r.is_featured)}
                >
                  {r.is_featured ? 'Featured' : 'Feature'}
                </Button>
                {r.status !== 'approved' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void setStatus(r.id, 'approved')}
                  >
                    Approve
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
