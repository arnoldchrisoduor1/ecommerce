'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AuthModal } from '@/components/auth/AuthModal';

const ACCESS_KEY = 'studio_access_token';

export type AuthUser = {
  id: string;
  email: string;
  full_name?: string | null;
  customer_id?: string | null;
  email_verified: boolean;
  two_factor_enabled: boolean;
  two_factor_prompted_at?: string | null;
  two_factor_reminder_dismissed: boolean;
  needs_two_factor_suggestion?: boolean;
};

export type PendingAction =
  | { type: 'wishlist_add'; productId: string }
  | { type: 'wishlist_remove'; productId: string }
  | { type: 'place_order'; payload: Record<string, unknown> }
  | { type: 'navigate'; href: string }
  | { type: 'try_on'; productId: string };

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  ready: boolean;
  openAuth: (opts?: { tab?: 'login' | 'signup'; pending?: PendingAction }) => void;
  closeAuth: () => void;
  logout: () => Promise<void>;
  setSession: (user: AuthUser, accessToken: string) => void;
  refreshSession: () => Promise<boolean>;
  requireAuth: (pending: PendingAction) => boolean;
  authFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  toast: string | null;
  showToast: (msg: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function rawAuthFetch<T>(
  path: string,
  init: RequestInit | undefined,
  token: string | null,
): Promise<Response> {
  const url = `/api${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'login' | 'signup'>('login');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [suggest2fa, setSuggest2fa] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const setSession = useCallback((u: AuthUser, token: string) => {
    setUser(u);
    setAccessToken(token);
    try {
      sessionStorage.setItem(ACCESS_KEY, token);
    } catch {
      /* ignore */
    }
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    try {
      sessionStorage.removeItem(ACCESS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await rawAuthFetch<{
      user: AuthUser;
      access_token: string;
    }>('/auth/refresh', { method: 'POST' }, null);
    if (!res.ok) {
      clearSession();
      return false;
    }
    const data = await res.json();
    setSession(data.user, data.access_token);
    return true;
  }, [clearSession, setSession]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        let token: string | null = null;
        try {
          token = sessionStorage.getItem(ACCESS_KEY);
        } catch {
          /* ignore */
        }
        if (token) {
          const me = await rawAuthFetch<{ user: AuthUser }>('/auth/me', undefined, token);
          if (me.ok) {
            const data = await me.json();
            if (!cancelled) setSession(data.user, token);
            if (!cancelled) setReady(true);
            return;
          }
        }
        const ok = await refreshSession();
        if (!cancelled && !ok) clearSession();
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSession, setSession]);

  const authFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      let res = await rawAuthFetch(path, init, accessToken);
      if (res.status === 401) {
        const ok = await refreshSession();
        if (ok) {
          const token = sessionStorage.getItem(ACCESS_KEY);
          res = await rawAuthFetch(path, init, token);
        }
      }
      if (!res.ok) {
        const err = new Error(`${init?.method || 'GET'} ${path} failed`) as Error & {
          status: number;
        };
        err.status = res.status;
        throw err;
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    },
    [accessToken, refreshSession],
  );

  const replayPending = useCallback(
    async (action: PendingAction, token: string) => {
      try {
        if (action.type === 'wishlist_add') {
          await rawAuthFetch(`/account/wishlist/${action.productId}`, { method: 'POST', body: '{}' }, token);
          showToast('Saved to wishlist');
          window.dispatchEvent(new Event('studio:wishlist-changed'));
        } else if (action.type === 'wishlist_remove') {
          await rawAuthFetch(`/account/wishlist/${action.productId}`, { method: 'DELETE' }, token);
          showToast('Removed from wishlist');
          window.dispatchEvent(new Event('studio:wishlist-changed'));
        } else if (action.type === 'navigate') {
          window.location.href = action.href;
        } else if (action.type === 'place_order') {
          window.dispatchEvent(
            new CustomEvent('studio:replay-place-order', { detail: action.payload }),
          );
          showToast('Continuing checkout…');
        } else if (action.type === 'try_on') {
          window.dispatchEvent(
            new CustomEvent('studio:try-on-resume', { detail: { productId: action.productId } }),
          );
        }
      } catch {
        showToast('Signed in — please try that action again');
      }
    },
    [showToast],
  );

  const openAuth = useCallback(
    (opts?: { tab?: 'login' | 'signup'; pending?: PendingAction }) => {
      if (opts?.pending) setPending(opts.pending);
      setModalTab(opts?.tab ?? 'login');
      setSuggest2fa(false);
      setModalOpen(true);
    },
    [],
  );

  const closeAuth = useCallback(() => {
    setModalOpen(false);
    setSuggest2fa(false);
  }, []);

  const requireAuth = useCallback(
    (action: PendingAction) => {
      if (user && accessToken) return true;
      openAuth({ tab: 'signup', pending: action });
      return false;
    },
    [user, accessToken, openAuth],
  );

  const logout = useCallback(async () => {
    try {
      await rawAuthFetch('/auth/logout', { method: 'POST' }, accessToken);
    } catch {
      /* ignore */
    }
    clearSession();
    showToast('Signed out');
  }, [accessToken, clearSession, showToast]);

  const onAuthSuccess = useCallback(
    async (u: AuthUser, token: string, opts?: { suggest2fa?: boolean }) => {
      setSession(u, token);
      if (opts?.suggest2fa) {
        setSuggest2fa(true);
        setModalOpen(true);
        return;
      }
      setModalOpen(false);
      const action = pending;
      setPending(null);
      if (action) await replayPending(action, token);
    },
    [pending, replayPending, setSession],
  );

  const onSkip2fa = useCallback(async () => {
    setSuggest2fa(false);
    setModalOpen(false);
    const action = pending;
    setPending(null);
    if (action && accessToken) await replayPending(action, accessToken);
  }, [pending, accessToken, replayPending]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      ready,
      openAuth,
      closeAuth,
      logout,
      setSession,
      refreshSession,
      requireAuth,
      authFetch,
      toast,
      showToast,
    }),
    [
      user,
      accessToken,
      ready,
      openAuth,
      closeAuth,
      logout,
      setSession,
      refreshSession,
      requireAuth,
      authFetch,
      toast,
      showToast,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={modalOpen}
        tab={modalTab}
        onTabChange={setModalTab}
        onClose={closeAuth}
        onSuccess={onAuthSuccess}
        suggest2fa={suggest2fa}
        onSkip2fa={onSkip2fa}
        onEnable2fa={async () => {
          if (!accessToken) return;
          await rawAuthFetch('/auth/two-factor', { method: 'POST', body: JSON.stringify({ enabled: true }) }, accessToken);
          setSuggest2fa(false);
          setModalOpen(false);
          window.location.href = `/verify?purpose=two_factor&email=${encodeURIComponent(user?.email || '')}`;
        }}
      />
      {toast ? (
        <div className="auth-toast" role="status" data-testid="auth-toast">
          {toast}
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
