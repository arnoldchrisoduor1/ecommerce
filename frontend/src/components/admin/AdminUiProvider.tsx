'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ensureAdminSession } from '@/lib/admin';

type Toast = { id: number; message: string; testId?: string };

type AdminUiContextValue = {
  ready: boolean;
  toast: (message: string, testId?: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
};

const AdminUiContext = createContext<AdminUiContextValue | null>(null);

export function AdminUiProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ensureAdminSession()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toast = useCallback((message: string, testId?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, testId }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <AdminUiContext.Provider value={{ ready, toast, toasts, dismissToast }}>
      {!ready ? (
        <div className="admin-loading ds-body" data-testid="admin-auth-loading">
          Loading admin…
        </div>
      ) : (
        children
      )}
      <div className="admin-toasts" aria-live="polite">
        {toasts.map((t) => (
          <p
            key={t.id}
            className="admin-toast ds-body"
            data-testid={t.testId}
            role="status"
          >
            {t.message}
          </p>
        ))}
      </div>
    </AdminUiContext.Provider>
  );
}

export function useAdminUi() {
  const ctx = useContext(AdminUiContext);
  if (!ctx) throw new Error('useAdminUi must be used within AdminUiProvider');
  return ctx;
}
