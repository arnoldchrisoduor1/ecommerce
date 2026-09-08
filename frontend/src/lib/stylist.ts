/** Parse stylist SSE: `data: {"text":"..."}` chunks and `[DONE]`. */
export async function streamStylistChat(
  message: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch('/api/stylist/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    let detail = 'Stylist is unavailable right now.';
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) detail = json.error;
    } catch {
      /* plain response */
    }
    throw new Error(detail);
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
          const parsed = JSON.parse(payload) as { text?: string };
          if (parsed.text) onChunk(parsed.text);
        } catch {
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
