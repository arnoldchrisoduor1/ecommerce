'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui';

export function StylistChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/stylist/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
        body: JSON.stringify({ message: text }),
      });
      const reply = res.ok
        ? await res.text()
        : 'Stylist is unavailable right now. Browse the shop or try again later.';
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'Stylist is unavailable right now. Browse the shop or try again later.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stylist">
      <button
        type="button"
        className="stylist__launcher ds-btn ds-btn--accent ds-btn--lg"
        data-testid="stylist-chat-launcher"
        aria-expanded={open}
        aria-controls="stylist-chat-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Stylist'}
      </button>

      {open ? (
        <div
          id="stylist-chat-panel"
          className="stylist__panel"
          data-testid="stylist-chat-panel"
          role="dialog"
          aria-label="AI stylist chat"
        >
          <p className="ds-label stylist__eyebrow">Shop with stylist</p>
          <div className="stylist__messages" aria-live="polite">
            {messages.length === 0 ? (
              <p className="ds-body--sm">Ask for fit, fabric, or outfit ideas.</p>
            ) : (
              messages.map((m, i) => (
                <p
                  key={`${m.role}-${i}`}
                  className={
                    m.role === 'user' ? 'ds-body--sm stylist__msg--user' : 'ds-body--sm'
                  }
                >
                  {m.text}
                </p>
              ))
            )}
          </div>
          <form className="stylist__form" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor="stylist-input">
              Message
            </label>
            <input
              id="stylist-input"
              className="stylist__input ds-body--sm"
              value={input}
              onChange={(ev) => setInput(ev.target.value)}
              placeholder="What are you looking for?"
              disabled={busy}
            />
            <Button type="submit" size="md" variant="primary" disabled={busy}>
              Send
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
