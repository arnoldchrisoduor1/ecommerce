'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

export type Discount = {
  id: string;
  code: string;
  type: string;
  value: number;
  is_active: boolean;
  context: string;
  active_from?: string | null;
  active_to?: string | null;
};

export function AdminDiscountsListClient() {
  const { ready, toast } = useAdminUi();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<{ discounts: Discount[] }>('/discounts');
    setDiscounts(r.discounts);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load().catch(() => setDiscounts([]));
  }, [ready, load]);

  async function toggleActive(d: Discount) {
    setBusyId(d.id);
    try {
      await adminSend(`/discounts/${d.id}`, 'PUT', { is_active: !d.is_active });
      await load();
      toast(d.is_active ? 'Discount disabled' : 'Discount enabled');
    } catch {
      toast('Could not update discount');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(d: Discount) {
    if (!window.confirm(`Delete discount ${d.code}?`)) return;
    setBusyId(d.id);
    try {
      await adminSend(`/discounts/${d.id}`, 'DELETE');
      await load();
      toast('Discount deleted');
    } catch {
      toast('Delete blocked — discount may have been used. Try disabling instead.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Discounts">
      <Link href="/admin/discounts/new">
        <Button variant="primary" size="sm">
          New discount
        </Button>
      </Link>
      <div className="admin-table-scroll"><table className="admin-table" data-testid="discounts-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Type</th>
            <th>Value</th>
            <th>Context</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {discounts.map((d) => (
            <tr key={d.id} data-testid="discount-row">
              <td>{d.code}</td>
              <td>{d.type}</td>
              <td>{d.value}</td>
              <td>{d.context}</td>
              <td>
                <AdminStatusPill status={d.is_active ? 'active' : 'inactive'} />
              </td>
              <td>
                <div className="admin-row-actions">
                  <Link href={`/admin/discounts/${d.id}`} className="ds-btn ds-btn--ghost ds-btn--xs">
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost ds-btn--xs"
                    disabled={busyId === d.id}
                    data-testid="discount-toggle"
                    onClick={() => void toggleActive(d)}
                  >
                    {d.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost ds-btn--xs"
                    disabled={busyId === d.id}
                    data-testid="discount-delete"
                    onClick={() => void remove(d)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </AdminShell>
  );
}

type FormProps = {
  discountId?: string;
};

export function AdminDiscountFormClient({ discountId }: FormProps) {
  const { ready, toast } = useAdminUi();
  const [code, setCode] = useState('');
  const [value, setValue] = useState('10');
  const [type, setType] = useState('percentage');
  const [context, setContext] = useState('general');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !discountId) return;
    void adminGet<{ discounts: Discount[] }>('/discounts').then((r) => {
      const d = r.discounts.find((x) => x.id === discountId);
      if (!d) return;
      setCode(d.code);
      setValue(String(d.value));
      setType(d.type);
      setContext(d.context || 'general');
      setIsActive(d.is_active);
    });
  }, [ready, discountId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        code: code.toUpperCase(),
        type,
        value: Number(value),
        context,
        is_active: isActive,
      };
      if (discountId) {
        await adminSend(`/discounts/${discountId}`, 'PUT', payload);
      } else {
        await adminSend('/discounts', 'POST', payload);
      }
      toast('Discount saved', 'discount-saved-toast');
    } catch {
      toast('Could not save discount');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title={discountId ? 'Edit discount' : 'New discount'}>
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Code</span>
          <input
            className="admin-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="discount-code"
            required
            readOnly={Boolean(discountId)}
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Type</span>
          <select className="admin-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        <label className="admin-field">
          <span className="ds-label">Value</span>
          <input
            className="admin-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="discount-value"
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Context</span>
          <select className="admin-input" value={context} onChange={(e) => setContext(e.target.value)}>
            <option value="general">General</option>
            <option value="exit_intent">Exit intent</option>
          </select>
        </label>
        {discountId ? (
          <label className="admin-field admin-field--row">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="ds-label">Active</span>
          </label>
        ) : null}
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-discount">
          Save discount
        </Button>
      </form>
    </AdminShell>
  );
}
