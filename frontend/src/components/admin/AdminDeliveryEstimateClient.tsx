'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminSend } from '@/lib/admin';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui';

type Block = {
  key: string;
  data: {
    min_days?: number;
    max_days?: number;
  };
};

export function AdminDeliveryEstimateClient() {
  const { ready } = useAdminUi();
  const [minDays, setMinDays] = useState(3);
  const [maxDays, setMaxDays] = useState(8);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    void apiGet<Block>('/content/blocks/delivery_estimate')
      .then((block) => {
        setMinDays(block.data?.min_days ?? 3);
        setMaxDays(block.data?.max_days ?? 8);
      })
      .catch(() => {
        setMinDays(3);
        setMaxDays(8);
      });
  }, [ready]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaved(false);
    const min = Math.max(1, Number(minDays) || 1);
    const max = Math.max(min, Number(maxDays) || min);
    setBusy(true);
    try {
      await adminSend('/content/blocks/delivery_estimate', 'PUT', {
        data: { min_days: min, max_days: max },
        is_active: true,
      });
      setMinDays(min);
      setMaxDays(max);
      setSaved(true);
    } catch {
      setError('Could not save delivery estimate default');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Delivery estimate">
      <p className="ds-body" style={{ marginBottom: '1rem', maxWidth: '42rem' }}>
        Default window stamped onto new orders at checkout (until you override an individual
        order). Shown to customers as business days.
      </p>
      <form className="admin-form" onSubmit={(e) => void onSave(e)}>
        <label className="admin-field">
          <span className="ds-label">Minimum days</span>
          <input
            type="number"
            min={1}
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value))}
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Maximum days</span>
          <input
            type="number"
            min={1}
            value={maxDays}
            onChange={(e) => setMaxDays(Number(e.target.value))}
            required
          />
        </label>
        <p className="ds-caption">
          Preview: {minDays === maxDays ? `${minDays} business days` : `${minDays}–${maxDays} business days`}
        </p>
        <Button type="submit" variant="primary" size="md" disabled={busy}>
          Save default
        </Button>
        {saved ? <p className="ds-caption">Saved.</p> : null}
        {error ? (
          <p className="ds-caption email-capture__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AdminShell>
  );
}
