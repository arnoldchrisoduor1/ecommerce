'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

type Discount = {
  id: string;
  code: string;
  type: string;
  value: number;
  is_active: boolean;
  context: string;
};

export function AdminDiscountsListClient() {
  const { ready } = useAdminUi();
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ discounts: Discount[] }>('/discounts').then((r) =>
      setDiscounts(r.discounts),
    );
  }, [ready]);

  return (
    <AdminShell title="Discounts">
      <Link href="/admin/discounts/new">
        <Button variant="primary" size="sm">
          New discount
        </Button>
      </Link>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Type</th>
            <th>Value</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          {discounts.map((d) => (
            <tr key={d.id}>
              <td>{d.code}</td>
              <td>{d.type}</td>
              <td>{d.value}</td>
              <td>{d.context}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}

export function AdminDiscountFormClient() {
  const { toast } = useAdminUi();
  const [code, setCode] = useState('');
  const [value, setValue] = useState('10');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        code: code.toUpperCase(),
        type: 'percentage',
        value: Number(value),
        context: code.toUpperCase() === 'WELCOME10' ? 'exit_intent' : 'general',
      };
      try {
        await adminSend('/discounts', 'POST', payload);
      } catch (err) {
        const list = await adminGet<{ discounts: Discount[] }>('/discounts');
        const existing = list.discounts.find(
          (d) => d.code.toUpperCase() === payload.code,
        );
        if (existing) {
          await adminSend(`/discounts/${existing.id}`, 'PUT', payload);
        } else {
          throw err;
        }
      }
      toast('Discount saved', 'discount-saved-toast');
    } catch {
      toast('Could not save discount');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="New discount">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Code</span>
          <input
            className="admin-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="discount-code"
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Value (%)</span>
          <input
            className="admin-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="discount-value"
            required
          />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-discount">
          Save discount
        </Button>
      </form>
    </AdminShell>
  );
}
