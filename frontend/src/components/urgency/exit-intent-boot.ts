/** Session key — shared with ExitIntent.tsx */
export const EXIT_INTENT_KEY = 'studio_exit_intent_shown';

/** After show/dismiss, suppress re-trigger for this long (ms). */
export const EXIT_INTENT_SUPPRESS_MS = 45_000;

export function exitIntentSuppressed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = sessionStorage.getItem(EXIT_INTENT_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < EXIT_INTENT_SUPPRESS_MS;
}

export function markExitIntentShown(): void {
  sessionStorage.setItem(EXIT_INTENT_KEY, String(Date.now()));
}

/**
 * Inline boot script (runs before React hydrate).
 * Playwright fires mouseleave immediately after goto; without this, the
 * client listener often isn't attached yet and the modal never opens.
 */
export const EXIT_INTENT_BOOT_SCRIPT = `(function(){
  var KEY=${JSON.stringify(EXIT_INTENT_KEY)};
  var SUPPRESS_MS=${EXIT_INTENT_SUPPRESS_MS};
  function suppressed(){
    var raw=sessionStorage.getItem(KEY);
    if(!raw)return false;
    var ts=parseInt(raw,10);
    if(isNaN(ts))return false;
    return Date.now()-ts<SUPPRESS_MS;
  }
  function markShown(){
    sessionStorage.setItem(KEY,String(Date.now()));
  }
  function fire(){
    if(suppressed())return;
    markShown();
    window.__STUDIO_EXIT_PENDING=true;
    try{window.dispatchEvent(new Event('studio:exit-intent'));}catch(e){}
  }
  document.documentElement.addEventListener('mouseleave',fire);
  document.addEventListener('mouseout',function(e){
    if(!e.relatedTarget&&!e.toElement)fire();
    if(e.clientY<=0)fire();
  });
  window.addEventListener('mousemove',function(e){
    if(e.clientY<=10)fire();
  });
})();`;

declare global {
  interface Window {
    __STUDIO_EXIT_PENDING?: boolean;
  }
}
