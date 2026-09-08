/** Session key — shared with ExitIntent.tsx */
export const EXIT_INTENT_KEY = 'studio_exit_intent_shown';

/**
 * Inline boot script (runs before React hydrate).
 * Playwright fires mouseleave immediately after goto; without this, the
 * client listener often isn't attached yet and the modal never opens.
 */
export const EXIT_INTENT_BOOT_SCRIPT = `(function(){
  var KEY=${JSON.stringify(EXIT_INTENT_KEY)};
  function fire(){
    if(sessionStorage.getItem(KEY))return;
    sessionStorage.setItem(KEY,'1');
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
