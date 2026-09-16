import { NextResponse } from 'next/server';

/**
 * Server-side admin login using container env (ADMIN_EMAIL / ADMIN_PASSWORD).
 * Avoids baking credentials into the client bundle.
 */
export async function POST() {
  const apiOrigin = (process.env.API_URL || 'http://localhost:8081').replace(/\/$/, '');
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'change-me-in-production';

  const res = await fetch(`${apiOrigin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: 'Admin login failed', detail: text.slice(0, 200) },
      { status: res.status },
    );
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    return NextResponse.json({ error: 'No token in login response' }, { status: 502 });
  }
  return NextResponse.json({ token: data.token });
}
