# Production Debug — 3 features not rendering despite passing verification locally

Three features (Task 24 viewer count, Task 21 AI try-on, Task 20 demo developer modal) were reported PASS in dev but do not appear on the deployed production site. The AI stylist chat works fine in production, which rules out OpenRouter connectivity/env issues in general — so investigate each of these individually rather than assuming one root cause.

Work through each in order. For each, report:

ISSUE: <feature>
Hypothesis tested:
Evidence:
Root cause found:
Fix applied:


## 1. Viewing-now count not showing

Check in this order:
- Is the frontend actually making the batched count request on the deployed build? Open the live site, check Network tab on a listing/PDP page for the count-fetch call. If it's not firing at all, it's a build/bundling issue (env var not set at build time for a client component, or the component got tree-shaken/conditionally excluded). If it IS firing, check the response.
- If the request fires but returns empty/zero: check whether the WebSocket/polling/Redis-backed live-count backend is actually running and reachable from production (not just dev) — is Redis provisioned and reachable in the prod environment? Check server logs for connection errors to Redis at deploy time.
- Check whether the "hide below threshold" logic (< 2 viewers) is why nothing shows — if production traffic is near-zero right now, the count may be correctly hidden, not broken. Manually open the product in two separate browser sessions right now and confirm whether it appears once the threshold is met.
- Confirm the relevant env vars (Redis URL, any WebSocket endpoint) are actually set in the production environment, not just `.env.local`/dev.

## 2. AI try-on feature completely absent

- Check the deployed frontend bundle: is the Quick View "Try with AI" section rendering at all in the DOM (view source / inspect), or is it missing entirely from the markup? If missing from markup, it's a build-time issue — check whether a feature flag or env var gating it (if any was added) is unset in production.
- Check whether this feature was gated behind `APP_MODE` or any other flag by mistake during Task 21 implementation — re-check the code for any conditional that might be excluding it unintentionally in a production build (e.g. accidentally wrapped in the same demo-mode check as Task 20/17's mascot).
- Confirm the 2FA gate isn't silently hiding the entire section for users without 2FA rather than showing the "requires 2FA" message as specified — test as a user with 2FA enabled and confirm whether it appears then.
- Check production logs for a build error or warning on this specific component that might have caused it to be silently dropped from the bundle.

## 3. Demo developer modal not appearing at all

- First confirm: is `APP_MODE=demo` (or `NEXT_PUBLIC_APP_MODE=demo`) actually set in the production environment's env vars? This is the most likely cause — if it defaults to `production` when unset (as specified in Task 17/20), and the production deploy never set it, the entire code path correctly does not render, by design.
- If the flag IS set correctly, check localStorage: if this browser/site was ever visited during dev/testing with the same domain, the "first visit only" dismissal flag may already be set in localStorage from earlier testing, suppressing it. Test in a fresh incognito session.
- If neither of those explain it, check whether the component is present in the production bundle at all (view source) the same way as item 2.

## 4. Admin "AI Usage" page fails to load

- Check the actual error: open browser dev tools / network tab on the admin AI Usage page in production and capture the failing request(s) — status code and response body, not just the generic "could not load" UI message.
- Most likely cause: `OPENROUTER_MANAGEMENT_KEY` (the separate management-tier key needed for `GET /api/v1/credits`, distinct from the regular `OPENROUTER_API_KEY` used for chat calls) was never set in the production environment. Since it's a different key type generated separately in the OpenRouter dashboard, it's easy to have set the regular key but missed this one. Confirm whether it's present in production env vars at all.
- If the management key IS set, check whether the `GET /api/v1/key` and `GET /api/v1/credits` calls are succeeding server-side by checking production logs directly — a 401/403 there usually means the key is invalid/revoked/wrong tier, not missing.
- Check the Redis cache layer for these stats (5-min TTL, per the original spec) — confirm Redis is reachable in production the same way you check it for item 1 above, since a failed cache read/write could be surfacing as a load failure rather than degrading gracefully.
- Confirm the endpoint isn't failing because `ai_usage_log` table migration wasn't run in production — check migration status against the production DB specifically, not just the dev DB.
- This page should fail gracefully (a clear "Unable to reach OpenRouter — check API key configuration" message with a retry button) rather than a generic broken/blank load state, regardless of which of the above is the cause — fix the graceful-degradation UI as part of this even after the root cause is found, so future key/connectivity issues don't look this opaque again.

**Verification:** Once fixed, screenshot the AI Usage page loading correctly on the live production URL with real numbers. Additionally, temporarily break the management key (invalid value) and confirm the page now shows the clear graceful-degradation message instead of a bare failure state, then restore the correct key.

## After all four are diagnosed

- Do not apply speculative fixes to more than one issue at a time — fix and verify one, then move to the next.
- Once all three are confirmed working on the actual production URL (not just localhost), paste a final report with a screenshot or network trace for each, taken from the live deployed site.
