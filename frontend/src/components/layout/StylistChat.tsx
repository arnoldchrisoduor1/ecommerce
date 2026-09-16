'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { useCart } from '@/components/cart/CartProvider';
import { apiGet, type ProductDetail, type ProductListItem } from '@/lib/api';
import { formatKes } from '@/lib/format';
import {
  fetchStylistStatus,
  slugsInText,
  streamStylistChat,
  submitStyleQuiz,
  type StyleQuizAnswers,
  type StyleQuizProduct,
} from '@/lib/stylist';

const QUIZ_STEPS: { key: keyof StyleQuizAnswers; label: string; options: { id: string; label: string }[] }[] = [
  {
    key: 'vibe',
    label: 'Your vibe',
    options: [
      { id: 'minimal', label: 'Minimal' },
      { id: 'bold', label: 'Bold' },
      { id: 'classic', label: 'Classic' },
    ],
  },
  {
    key: 'budget',
    label: 'Budget',
    options: [
      { id: 'low', label: 'Under KES 1,500' },
      { id: 'mid', label: 'KES 1,500–3,500' },
      { id: 'high', label: 'Above KES 3,500' },
    ],
  },
  {
    key: 'fit',
    label: 'Preferred fit',
    options: [
      { id: 'fitted', label: 'Fitted' },
      { id: 'relaxed', label: 'Relaxed' },
    ],
  },
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  slugs?: string[];
};

type SlugMeta = { slug: string; name: string; variantId: string };

export function StyleQuizFlow({ onDone }: { onDone?: () => void }) {
  const { sessionId, addToCart } = useCart();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<StyleQuizAnswers>>({});
  const [results, setResults] = useState<StyleQuizProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish(finalAnswers: StyleQuizAnswers) {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      const res = await submitStyleQuiz(sessionId, finalAnswers);
      setResults(res.products);
    } catch {
      setError('Could not load picks. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function pick(optionId: string) {
    const current = QUIZ_STEPS[step];
    const next = { ...answers, [current.key]: optionId };
    setAnswers(next);
    if (step >= QUIZ_STEPS.length - 1) {
      void finish(next as StyleQuizAnswers);
    } else {
      setStep(step + 1);
    }
  }

  async function addProduct(slug: string) {
    try {
      const detail = await apiGet<ProductDetail>(`/catalog/products/${slug}`);
      const variant =
        detail.variants.find((v) => v.stock_qty > 0) ?? detail.variants[0];
      if (!variant) return;
      await addToCart(variant.id, 1);
    } catch {
      setError('Could not add to bag');
    }
  }

  if (results) {
    return (
      <div className="stylist-quiz" data-testid="style-quiz-results">
        <p className="ds-label">Your picks</p>
        <ul className="stylist-quiz__list">
          {results.map((p) => (
            <li key={p.id} className="stylist-quiz__item">
              <Link href={`/product/${p.slug}`} className="stylist-quiz__link">
                <span className="ds-body">{p.name}</span>
                <span className="ds-caption">
                  {formatKes(p.sale_price ?? p.base_price)}
                </span>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                data-testid="style-quiz-add-to-bag"
                onClick={() => void addProduct(p.slug)}
              >
                Add to bag
              </Button>
            </li>
          ))}
        </ul>
        {onDone ? (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Back to chat
          </Button>
        ) : null}
      </div>
    );
  }

  const current = QUIZ_STEPS[step];
  return (
    <div className="stylist-quiz" data-testid="style-quiz-panel">
      <p className="ds-label">
        Style quiz · step {step + 1}/{QUIZ_STEPS.length}
      </p>
      <p className="ds-body">{current.label}</p>
      <div className="stylist-quiz__options" data-testid="style-quiz-step">
        {current.options.map((opt) => (
          <Button
            key={opt.id}
            variant="secondary"
            size="sm"
            data-testid="style-quiz-option"
            disabled={busy}
            onClick={() => pick(opt.id)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="ds-caption" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StylistChatPanel({
  configured,
}: {
  configured: boolean | null;
}) {
  const { addToCart } = useCart();
  const [mode, setMode] = useState<'chat' | 'quiz'>('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [slugCatalog, setSlugCatalog] = useState<SlugMeta[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const chatDisabled = configured === false || busy;

  useEffect(() => {
    if (configured !== true) return;
    void apiGet<{ products: ProductListItem[] }>(
      '/catalog/products?sort=latest&page_size=40',
    ).then(async (res) => {
      const metas: SlugMeta[] = [];
      for (const p of res.products.filter((x) => !x.is_bundle).slice(0, 20)) {
        try {
          const detail = await apiGet<ProductDetail>(`/catalog/products/${p.slug}`);
          const variant =
            detail.variants.find((v) => v.stock_qty > 0) ?? detail.variants[0];
          if (variant) metas.push({ slug: p.slug, name: p.name, variantId: variant.id });
        } catch {
          /* skip */
        }
      }
      setSlugCatalog(metas);
    });
  }, [configured]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages]);

  async function addBySlug(slug: string) {
    const meta = slugCatalog.find((s) => s.slug === slug);
    if (!meta) return;
    await addToCart(meta.variantId, 1);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatDisabled || configured !== true) return;
    setInput('');
    const userId = crypto.randomUUID();
    setMessages((m) => [...m, { id: userId, role: 'user', text }]);
    setBusy(true);

    const assistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: assistantId, role: 'assistant', text: '', streaming: true },
    ]);

    try {
      let full = '';
      await streamStylistChat(text, (chunk) => {
        full += chunk;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, text: full } : msg,
          ),
        );
      });
      const slugs = slugsInText(
        full,
        slugCatalog.map((s) => s.slug),
      );
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, text: full, streaming: false, slugs }
            : msg,
        ),
      );
    } catch (err) {
      const fallback =
        err instanceof Error
          ? err.message
          : 'Stylist is unavailable right now. Browse the shop or try again later.';
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, text: fallback, streaming: false }
            : msg,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stylist__tabs" role="tablist" aria-label="Stylist modes">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'chat'}
          className={`stylist__tab ds-label${mode === 'chat' ? ' stylist__tab--active' : ''}`}
          onClick={() => setMode('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'quiz'}
          className={`stylist__tab ds-label${mode === 'quiz' ? ' stylist__tab--active' : ''}`}
          data-testid="style-quiz-tab"
          onClick={() => setMode('quiz')}
          disabled={configured === false}
        >
          Style quiz
        </button>
      </div>

      {mode === 'quiz' && configured !== false ? (
        <StyleQuizFlow onDone={() => setMode('chat')} />
      ) : (
        <>
          <div
            ref={messagesRef}
            className="stylist__messages"
            aria-live="polite"
            data-testid="stylist-chat-messages"
          >
            {configured === false ? (
              <div className="stylist-warmup" data-testid="stylist-unconfigured">
                <div className="stylist-warmup__icon" aria-hidden="true">
                  <StylistSparkIcon />
                </div>
                <h3 className="ds-display ds-display--sm stylist-warmup__title">
                  AI Stylist is warming up
                </h3>
                <p className="ds-body stylist-warmup__body">
                  AI credentials not provided — this feature will be available shortly.
                </p>
              </div>
            ) : messages.length === 0 ? (
              <p className="ds-body--sm">Ask for fit, fabric, or outfit ideas.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'stylist__msg stylist__msg--user'
                      : 'stylist__msg'
                  }
                  data-testid={
                    m.role === 'user' ? 'stylist-chat-message-user' : 'stylist-chat-message'
                  }
                >
                  <p className="ds-body--sm">{m.text}</p>
                  {m.streaming ? (
                    <span className="stylist__cursor" data-testid="stylist-chat-streaming" />
                  ) : null}
                  {m.slugs && m.slugs.length > 0 ? (
                    <div className="stylist__actions">
                      {m.slugs.map((slug) => {
                        const meta = slugCatalog.find((s) => s.slug === slug);
                        return (
                          <Button
                            key={slug}
                            variant="secondary"
                            size="sm"
                            data-testid="stylist-add-to-bag"
                            onClick={() => void addBySlug(slug)}
                          >
                            Add {meta?.name ?? slug}
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <form className="stylist__form" onSubmit={(e) => void onSubmit(e)}>
            <label className="visually-hidden" htmlFor="stylist-input">
              Message
            </label>
            <input
              id="stylist-input"
              className="stylist__input ds-body--sm"
              value={input}
              onChange={(ev) => setInput(ev.target.value)}
              placeholder={
                configured === false
                  ? 'Chat unavailable until stylist is ready'
                  : 'What are you looking for?'
              }
              disabled={chatDisabled || configured === null}
              aria-disabled={chatDisabled || configured === null}
              data-testid="stylist-chat-input"
            />
            <Button
              type="submit"
              size="md"
              variant="primary"
              disabled={chatDisabled || configured !== true}
              data-testid="stylist-chat-send"
            >
              Send
            </Button>
          </form>
        </>
      )}
    </>
  );
}

export function StylistChat() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConfigured(null);
    void fetchStylistStatus()
      .then((s) => {
        if (!cancelled) setConfigured(s.configured);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, close]);

  return (
    <div className="stylist">
      <button
        type="button"
        className="stylist__fab"
        data-testid="stylist-chat-launcher"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="stylist-chat-panel"
        onClick={() => setOpen(true)}
      >
        <span className="stylist__fab-icon" aria-hidden="true">
          <StylistSparkIcon />
        </span>
        <span className="stylist__fab-label ds-label">Stylist</span>
      </button>

      {open ? (
        <div
          className="stylist-modal"
          role="presentation"
          data-testid="stylist-modal-root"
        >
          <button
            type="button"
            className="stylist-modal__scrim"
            aria-label="Close stylist"
            data-testid="stylist-modal-backdrop"
            onClick={close}
          />
          <div
            id="stylist-chat-panel"
            className="stylist__panel"
            data-testid="stylist-chat-panel"
            role="dialog"
            aria-modal="true"
            aria-label="AI stylist chat"
          >
            <button
              ref={closeBtnRef}
              type="button"
              className="stylist__close"
              aria-label="Close"
              data-testid="stylist-modal-close"
              onClick={close}
            >
              <CloseIcon />
            </button>
            <p className="ds-label stylist__eyebrow">Shop with stylist</p>
            <StylistChatPanel configured={configured} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StylistSparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
      <path d="M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
