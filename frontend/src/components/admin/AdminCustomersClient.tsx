'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet } from '@/lib/admin';

type Customer = {
  id: string;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  is_guest: boolean;
  order_count?: number;
};

export function AdminCustomersClient() {
  const { ready } = useAdminUi();
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ customers: Customer[] }>('/customers').then((r) =>
      setCustomers(r.customers),
    );
  }, [ready]);

  return (
    <AdminShell title="Customers">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Guest</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.full_name || '—'}</td>
              <td>{c.email || '—'}</td>
              <td>{c.phone || '—'}</td>
              <td>{c.is_guest ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
