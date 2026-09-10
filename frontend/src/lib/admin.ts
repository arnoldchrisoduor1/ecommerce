const TOKEN_KEY = 'studio_admin_token';

export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function adminLogin(
  email = 'admin@example.com',
  password = 'change-me-in-production',
): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new AdminApiError(res.status, 'Admin login failed');
  }
  const data = (await res.json()) as { token: string };
  setAdminToken(data.token);
}

export async function ensureAdminSession(): Promise<void> {
  if (getAdminToken()) return;
  await adminLogin();
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureAdminSession();
  const token = getAdminToken();
  const url = `/api/admin${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    setAdminToken('');
    await ensureAdminSession();
    return adminFetch(path, init);
  }
  if (!res.ok) {
    throw new AdminApiError(res.status, `${init?.method || 'GET'} ${path} failed`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function adminGet<T>(path: string) {
  return adminFetch<T>(path);
}

export function adminSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  return adminFetch<T>(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export function adminUpload<T>(path: string, form: FormData) {
  return adminFetch<T>(path, { method: 'POST', body: form });
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export type AdminOverview = {
  orders_today: number;
  revenue_today: number;
  active_viewers: number;
  discount_claims_today: number;
  recent_orders?: unknown[];
};

export type LowStockVariant = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  stock_qty: number;
  low_stock_threshold: number;
};
