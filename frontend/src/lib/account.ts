/** Guest account identity — phone from checkout + cart session_id. */

const PHONE_KEY = 'studio_account_phone';
const EMAIL_KEY = 'studio_account_email';

export function getAccountPhone(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PHONE_KEY) || '';
}

export function setAccountPhone(phone: string) {
  if (typeof window === 'undefined') return;
  const t = phone.trim();
  if (t) localStorage.setItem(PHONE_KEY, t);
}

export function getAccountEmail(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(EMAIL_KEY) || '';
}

export function setAccountEmail(email: string) {
  if (typeof window === 'undefined') return;
  const t = email.trim();
  if (t) localStorage.setItem(EMAIL_KEY, t);
}

export function accountQuery(sessionId: string, extra?: { phone?: string; email?: string }) {
  const params = new URLSearchParams();
  if (sessionId) params.set('session_id', sessionId);
  const phone = extra?.phone ?? getAccountPhone();
  const email = extra?.email ?? getAccountEmail();
  if (phone) params.set('phone', phone);
  if (email) params.set('email', email);
  const q = params.toString();
  return q ? `?${q}` : '';
}
