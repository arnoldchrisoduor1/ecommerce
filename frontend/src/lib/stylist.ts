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

export async function streamStylistChat(
  message: string,
  onChunk: (text: string) => void,
  sessionId?: string,
): Promise<void> {
  const res = await fetch('/api/stylist/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, session_id: sessionId || undefined }),
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

/** Find catalog slugs mentioned in assistant copy. */
export function slugsInText(text: string, knownSlugs: string[]): string[] {
  const lower = text.toLowerCase();
  return knownSlugs.filter((slug) => lower.includes(slug));
}
