import type { ReactNode } from 'react';
import { AdminUiProvider } from '@/components/admin/AdminUiProvider';
import '../globals.css';
import './admin.css';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminUiProvider>
      {children}
    </AdminUiProvider>
  );
}
