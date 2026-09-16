'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './demo.css';

const LS_DISMISSED = 'studio-demo-welcome-dismissed';
const LS_COLLAPSED = 'studio-demo-mascot-collapsed';

const TOAST_LINES = [
  'Like what you see?',
  'Want a store like this?',
  'I can be yours — tap to chat',
  'Built by Digital Wilderness — say hi?',
] as const;

const EMAIL =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_EMAIL || 'arnoldchrisoduor@gmail.com';
const PHONE =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_PHONE || '+254791165995';

type Phase = 'boot' | 'welcome' | 'morph' | 'docked';

function randomToastDelayMs() {
  return 90_000 + Math.floor(Math.random() * 30_000);
}

function pickToast(prev: string | null): string {
  let next = TOAST_LINES[Math.floor(Math.random() * TOAST_LINES.length)]!;
  let guard = 0;
  while (next === prev && guard < 8) {
    next = TOAST_LINES[Math.floor(Math.random() * TOAST_LINES.length)]!;
    guard += 1;
  }
  return next;
}

function MascotFace({ amused }: { amused?: boolean }) {
  return (
    <svg className="demo-mascot__face" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" className="demo-mascot__body" />
      <ellipse
        cx="22"
        cy="28"
        rx="3.2"
        ry={amused ? 1.2 : 3.5}
        className="demo-mascot__eye demo-mascot__eye--l"
      />
      <ellipse
        cx="42"
        cy="28"
        rx="3.2"
        ry={amused ? 1.2 : 3.5}
        className="demo-mascot__eye demo-mascot__eye--r"
      />
      <path
        className="demo-mascot__mouth"
        d={amused ? 'M22 40 Q32 48 42 40' : 'M24 40 Q32 44 40 40'}
        fill="none"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="14" cy="36" r="3" className="demo-mascot__cheek" />
      <circle cx="50" cy="36" r="3" className="demo-mascot__cheek" />
    </svg>
  );
}

export function DemoMascot() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [collapsed, setCollapsed] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);

  const lastToastRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const dismissToastRef = useRef<number | null>(null);

  useEffect(() => {
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerMq = window.matchMedia('(pointer: coarse)');
    const syncMotion = () => setReduceMotion(motionMq.matches);
    const syncPointer = () => setCoarsePointer(pointerMq.matches);
    syncMotion();
    syncPointer();
    motionMq.addEventListener('change', syncMotion);
    pointerMq.addEventListener('change', syncPointer);
    return () => {
      motionMq.removeEventListener('change', syncMotion);
      pointerMq.removeEventListener('change', syncPointer);
    };
  }, []);

  useEffect(() => {
    let dismissed = false;
    let wasCollapsed = false;
    try {
      dismissed = localStorage.getItem(LS_DISMISSED) === '1';
      wasCollapsed = localStorage.getItem(LS_COLLAPSED) === '1';
    } catch {
      /* private mode */
    }
    setCollapsed(wasCollapsed);
    setPhase(dismissed ? 'docked' : 'welcome');
  }, []);

  const persistDismissed = useCallback(() => {
    try {
      localStorage.setItem(LS_DISMISSED, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const persistCollapsed = useCallback((value: boolean) => {
    try {
      localStorage.setItem(LS_COLLAPSED, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const dismissWelcome = useCallback(() => {
    persistDismissed();
    if (reduceMotion) {
      setPhase('docked');
      return;
    }
    setPhase('morph');
    window.setTimeout(() => setPhase('docked'), 520);
  }, [persistDismissed, reduceMotion]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      if (next) {
        setCardOpen(false);
        setToast(null);
      }
      return next;
    });
  }, [persistCollapsed]);

  const openCard = useCallback(() => {
    setToast(null);
    setCardOpen(true);
    if (collapsed) {
      setCollapsed(false);
      persistCollapsed(false);
    }
  }, [collapsed, persistCollapsed]);

  const copyPhone = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PHONE);
      setPhoneCopied(true);
      window.setTimeout(() => setPhoneCopied(false), 2000);
    } catch {
      setPhoneCopied(false);
    }
  }, []);

  const onPhoneAction = useCallback(() => {
    if (coarsePointer) {
      window.location.href = `tel:${PHONE}`;
      return;
    }
    void copyPhone();
  }, [coarsePointer, copyPhone]);

  // Periodic speech toasts while tab visible and mascot docked (not collapsed).
  useEffect(() => {
    if (phase !== 'docked' || collapsed) return;

    const clearTimers = () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
      if (dismissToastRef.current != null) window.clearTimeout(dismissToastRef.current);
      toastTimerRef.current = null;
      dismissToastRef.current = null;
    };

    const schedule = () => {
      clearTimers();
      toastTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState !== 'visible') {
          schedule();
          return;
        }
        const line = pickToast(lastToastRef.current);
        lastToastRef.current = line;
        setToast(line);
        setCardOpen(false);
        dismissToastRef.current = window.setTimeout(() => {
          setToast(null);
          schedule();
        }, 6000);
      }, randomToastDelayMs());
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
      else {
        clearTimers();
        setToast(null);
      }
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, collapsed]);

  if (phase === 'boot') return null;

  const mailtoDev = `mailto:${EMAIL}?subject=${encodeURIComponent('Demo store inquiry')}`;
  const mailtoBuild = `mailto:${EMAIL}?subject=${encodeURIComponent('What can I build for you?')}`;

  return (
    <div
      className={[
        'demo-mascot',
        `demo-mascot--${phase}`,
        collapsed ? 'demo-mascot--collapsed' : '',
        reduceMotion ? 'demo-mascot--reduce' : '',
        hovered ? 'demo-mascot--hover' : '',
        cardOpen ? 'demo-mascot--card-open' : '',
        toast ? 'demo-mascot--toast' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="demo-mascot"
    >
      {phase === 'welcome' ? (
        <div className="demo-mascot__welcome" role="dialog" aria-modal="true" aria-labelledby="demo-welcome-title">
          <div className="demo-mascot__welcome-scrim" aria-hidden="true" />
          <div className="demo-mascot__welcome-card">
            <div className="demo-mascot__welcome-mark" aria-hidden="true">
              <MascotFace />
            </div>
            <p className="ds-label demo-mascot__eyebrow">Studio demo</p>
            <h2 id="demo-welcome-title" className="ds-display ds-display--sm demo-mascot__title">
              This is a demo store
            </h2>
            <p className="demo-mascot__lead">
              A demonstration build to show how a polished storefront can look and feel. Explore freely —
              when you are ready, reach out.
            </p>
            <div className="demo-mascot__welcome-actions">
              <a className="demo-mascot__btn demo-mascot__btn--primary" href={mailtoDev}>
                Email the developer
              </a>
              <button
                type="button"
                className="demo-mascot__btn demo-mascot__btn--ghost"
                onClick={onPhoneAction}
              >
                {phoneCopied && !coarsePointer ? 'Phone copied' : `Call ${PHONE}`}
              </button>
            </div>
            <button type="button" className="demo-mascot__dismiss" onClick={dismissWelcome}>
              Continue browsing
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'morph' || phase === 'docked' ? (
        <div className="demo-mascot__dock">
          {collapsed ? (
            <button
              type="button"
              className="demo-mascot__tab"
              aria-label="Expand demo mascot"
              data-testid="demo-mascot-tab"
              onClick={toggleCollapsed}
            >
              Demo
            </button>
          ) : (
            <>
              {toast ? (
                <button
                  type="button"
                  className="demo-mascot__bubble"
                  data-testid="demo-mascot-toast"
                  onClick={openCard}
                >
                  {toast}
                </button>
              ) : null}

              {cardOpen ? (
                <div className="demo-mascot__card" data-testid="demo-mascot-card" role="dialog" aria-label="Contact">
                  <button
                    type="button"
                    className="demo-mascot__card-close"
                    aria-label="Close contact card"
                    onClick={() => setCardOpen(false)}
                  >
                    ×
                  </button>
                  <p className="ds-label demo-mascot__card-eyebrow">Digital Wilderness</p>
                  <a className="demo-mascot__card-link" href={mailtoDev}>
                    {EMAIL}
                  </a>
                  <button type="button" className="demo-mascot__card-link demo-mascot__card-link--btn" onClick={onPhoneAction}>
                    {phoneCopied ? 'Copied' : PHONE}
                  </button>
                  <a className="demo-mascot__card-cta" href={mailtoBuild}>
                    What can I build for you?
                  </a>
                </div>
              ) : null}

              <div className="demo-mascot__launcher">
                <button
                  type="button"
                  className="demo-mascot__fab"
                  data-testid="demo-mascot-fab"
                  aria-label="Demo contact"
                  aria-expanded={cardOpen}
                  onClick={openCard}
                  onMouseEnter={() => setHovered(true)}
                  onMouseLeave={() => setHovered(false)}
                  onFocus={() => setHovered(true)}
                  onBlur={() => setHovered(false)}
                >
                  <MascotFace amused={hovered} />
                </button>
                <button
                  type="button"
                  className="demo-mascot__collapse"
                  aria-label="Collapse demo mascot"
                  data-testid="demo-mascot-collapse"
                  onClick={toggleCollapsed}
                >
                  ›
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
