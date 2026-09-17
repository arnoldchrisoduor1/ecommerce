/** Parse stylist SSE: `data: {"text":"..."}` chunks and `[DONE]`. */

export async function fetchStylistStatus(): Promise<{ configured: boolean }> {
  const res = await fetch('/api/stylist/status', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { configured: false };
  return res.json() as Promise<{ configured: boolean }>;
}

export const AI_UNAVAILABLE_MESSAGE =
  'AI features are currently unavailable for your account. Contact support if you believe this is a mistake.';

export class StylistBlockedError extends Error {
  constructor(message = AI_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'StylistBlockedError';
  }
}

export type StylistHistoryTurn = { role: 'user' | 'assistant'; content: string };

export async function streamStylistChat(
  message: string,
  onChunk: (text: string) => void,
  opts?: { sessionId?: string; history?: StylistHistoryTurn[] },
): Promise<void> {
  const res = await fetch('/api/stylist/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      session_id: opts?.sessionId || undefined,
      history: opts?.history?.length ? opts.history : undefined,
    }),
  });

  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new StylistBlockedError(body?.message || AI_UNAVAILABLE_MESSAGE);
  }

  if (!res.ok) {
    throw new Error('AI not connected');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload) as { text?: string; error?: string };
          if (parsed.error) throw new Error('AI not connected');
          if (parsed.text) onChunk(parsed.text);
        } catch (err) {
          if (err instanceof Error && err.message === 'AI not connected') throw err;
          /* ignore malformed chunks */
        }
      }
    }
  }
}

export type StyleQuizAnswers = {
  vibe: string;
  budget: string;
  fit?: string;
};

export type StyleQuizProduct = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price?: number | null;
  primary_image?: { url: string } | null;
  variants?: { id: string; stock_qty: number }[];
};

export async function submitStyleQuiz(
  sessionId: string,
  answers: StyleQuizAnswers,
): Promise<{ products: StyleQuizProduct[] }> {
  const res = await fetch('/api/stylist/style-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
  if (!res.ok) throw new Error('Style quiz failed');
  return res.json() as Promise<{ products: StyleQuizProduct[] }>;
}

const PRODUCT_MARKER = /\[\[product:([a-z0-9][a-z0-9-]*)\]\]/gi;

/** Extract catalog product slugs from structured [[product:slug]] markers. */
export function productSlugsFromMarkers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PRODUCT_MARKER)) {
    const slug = match[1]?.toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    found.push(slug);
  }
  return found;
}

/** Strip markers for display text. */
export function stripProductMarkers(text: string): string {
  return text.replace(PRODUCT_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Find catalog slugs mentioned in assistant copy (markers first, then names/slugs). */
export function slugsInText(text: string, knownSlugs: string[]): string[] {
  const fromMarkers = productSlugsFromMarkers(text).filter((s) =>
    knownSlugs.includes(s),
  );
  if (fromMarkers.length > 0) return fromMarkers;
  const lower = text.toLowerCase();
  return knownSlugs.filter((slug) => lower.includes(slug));
}

/** Resolve product cards from markers or catalog name mentions (never invent). */
export function resolveProductSlugs(
  text: string,
  catalog: { slug: string; name: string }[],
): string[] {
  const known = catalog.map((c) => c.slug);
  const marked = productSlugsFromMarkers(text).filter((s) => known.includes(s));
  if (marked.length > 0) return marked;

  const lower = text.toLowerCase();
  const bySlug = known.filter((slug) => lower.includes(slug));
  if (bySlug.length > 0) return bySlug;

  const byName: string[] = [];
  const seen = new Set<string>();
  for (const item of catalog) {
    const name = item.name.trim().toLowerCase();
    if (name.length < 3) continue;
    if (lower.includes(name) && !seen.has(item.slug)) {
      seen.add(item.slug);
      byName.push(item.slug);
    }
  }
  return byName;
}

export const STYLIST_HISTORY_KEY = 'studio_stylist_messages';

export type PersistedStylistMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  slugs?: string[];
};

export function loadPersistedStylistMessages(): PersistedStylistMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STYLIST_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedStylistMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string' &&
        typeof m.id === 'string',
    );
  } catch {
    return [];
  }
}

export function persistStylistMessages(messages: PersistedStylistMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const slim = messages.map(({ id, role, text, slugs }) => ({ id, role, text, slugs }));
    sessionStorage.setItem(STYLIST_HISTORY_KEY, JSON.stringify(slim.slice(-40)));
  } catch {
    /* private mode */
  }
}
