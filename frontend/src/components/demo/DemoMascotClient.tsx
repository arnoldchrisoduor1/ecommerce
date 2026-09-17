'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './demo.css';

const SESSION_INTRO_KEY = 'studio_demo_contact_intro_seen';
/** Auto-dock reveal after this delay unless user dismisses first. */
const AUTO_DOCK_MS = 5000;
/** Periodic contact re-expand interval (2.5 min). */
const PERIODIC_EXPAND_MS = 150_000;
/** How long periodic expansion stays open. */
const PERIODIC_EXPAND_HOLD_MS = 8000;

const EMAIL =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_EMAIL || 'arnoldchrisoduor@gmail.com';
const PHONE =
  process.env.NEXT_PUBLIC_DEMO_CONTACT_PHONE || '+254791165995';

type Phase = 'boot' | 'reveal' | 'morph' | 'docked';

function ContactIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 6h16v12H4z" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContactDetails({
  onPhoneAction,
  phoneCopied,
  coarsePointer,
}: {
  onPhoneAction: () => void;
  phoneCopied: boolean;
  coarsePointer: boolean;
}) {
  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent('Demo store inquiry')}`;
  return (
    <>
      <p className="ds-label demo-contact__eyebrow">Developer contact</p>
      <a className="demo-contact__email" href={mailto} data-testid="demo-contact-email">
        {EMAIL}
      </a>
      <button
        type="button"
        className="demo-contact__phone"
        data-testid="demo-contact-phone"
        onClick={onPhoneAction}
      >
        {phoneCopied && !coarsePointer ? 'Phone copied' : PHONE}
      </button>
    </>
  );
}

export function DemoMascot() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [expanded, setExpanded] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);

  const autoDockRef = useRef<number | null>(null);
  const periodicRef = useRef<number | null>(null);
  const collapseRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (autoDockRef.current != null) window.clearTimeout(autoDockRef.current);
    if (periodicRef.current != null) window.clearTimeout(periodicRef.current);
    if (collapseRef.current != null) window.clearTimeout(collapseRef.current);
    autoDockRef.current = null;
    periodicRef.current = null;
    collapseRef.current = null;
  }, []);

  const dock = useCallback(() => {
    if (autoDockRef.current != null) {
      window.clearTimeout(autoDockRef.current);
      autoDockRef.current = null;
    }
    try {
      sessionStorage.setItem(SESSION_INTRO_KEY, '1');
    } catch {
      /* private mode */
    }
    if (reduceMotion) {
      setPhase('docked');
      return;
    }
    setPhase('morph');
    window.setTimeout(() => setPhase('docked'), 480);
  }, [reduceMotion]);

  useEffect(() => {
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerMq = window.matchMedia('(pointer: coarse)');
    const syncMotion = () => setReduceMotion(motionMq.matches);
    const syncPointer = () => setCoarsePointer(pointerMq.matches);
    syncMotion();
    syncPointer();
    motionMq.addEventListener('change', syncMotion);
    pointerMq.addEventListener('change', syncPointer);

    let seenIntro = false;
    try {
      seenIntro = sessionStorage.getItem(SESSION_INTRO_KEY) === '1';
    } catch {
      /* ignore */
    }
    setPhase(seenIntro ? 'docked' : 'reveal');

    return () => {
      motionMq.removeEventListener('change', syncMotion);
      pointerMq.removeEventListener('change', syncPointer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'reveal') return;
    autoDockRef.current = window.setTimeout(() => dock(), AUTO_DOCK_MS);
    return () => {
      if (autoDockRef.current != null) window.clearTimeout(autoDockRef.current);
    };
  }, [phase, dock]);

  const schedulePeriodic = useCallback(() => {
    if (periodicRef.current != null) window.clearTimeout(periodicRef.current);
    periodicRef.current = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        schedulePeriodic();
        return;
      }
      setExpanded(true);
      if (collapseRef.current != null) window.clearTimeout(collapseRef.current);
      collapseRef.current = window.setTimeout(() => {
        setExpanded(false);
        schedulePeriodic();
      }, PERIODIC_EXPAND_HOLD_MS);
    }, PERIODIC_EXPAND_MS);
  }, []);

  useEffect(() => {
    if (phase !== 'docked') return;
    schedulePeriodic();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedulePeriodic();
      else clearTimers();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, schedulePeriodic, clearTimers]);

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

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next && collapseRef.current != null) {
        window.clearTimeout(collapseRef.current);
        collapseRef.current = null;
      }
      return next;
    });
  }, []);

  if (phase === 'boot') return null;

  const showDock = phase === 'morph' || phase === 'docked';
  const showReveal = phase === 'reveal' || phase === 'morph';

  return (
    <div
      className={[
        'demo-contact',
        `demo-contact--${phase}`,
        expanded ? 'demo-contact--expanded' : '',
        reduceMotion ? 'demo-contact--reduce' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="demo-mascot"
    >
      {showReveal ? (
        <div
          className="demo-contact__reveal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-contact-title"
          data-testid="demo-contact-reveal"
        >
          <div className="demo-contact__reveal-card">
            <div className="demo-contact__reveal-icon" aria-hidden="true">
              <ContactIcon />
            </div>
            <h2 id="demo-contact-title" className="ds-display ds-display--sm demo-contact__title">
              Built by Digital Wilderness
            </h2>
            <p className="demo-contact__lead">Questions about this demo? Reach out directly.</p>
            <ContactDetails
              onPhoneAction={onPhoneAction}
              phoneCopied={phoneCopied}
              coarsePointer={coarsePointer}
            />
            <button
              type="button"
              className="demo-contact__dismiss"
              data-testid="demo-contact-dismiss"
              onClick={dock}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {showDock ? (
        <div className="demo-contact__dock" data-testid="demo-contact-dock">
          {expanded ? (
            <div className="demo-contact__card" data-testid="demo-mascot-card" role="dialog" aria-label="Contact">
              <button
                type="button"
                className="demo-contact__card-close"
                aria-label="Close contact card"
                onClick={() => setExpanded(false)}
              >
                ×
              </button>
              <ContactDetails
                onPhoneAction={onPhoneAction}
                phoneCopied={phoneCopied}
                coarsePointer={coarsePointer}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="demo-contact__icon"
            data-testid="demo-mascot-fab"
            aria-label="Contact developer"
            aria-expanded={expanded}
            onClick={toggleExpanded}
          >
            <ContactIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
