# Global loader audit — 2026-09-07

## Remote baseline
- main: 840f90b3de4860ba3d0e6701a2c19a81fce834e2.
- #100 merged 2026-09-07 01:55:21 UTC, d6609206a8a0323f85a02cf19a493e50c47d20ed: removes root loading.tsx, minimum 680ms, 180ms completion, white backdrop.
- #102 merged 2026-09-07 02:06:04 UTC, 840f90b3de4860ba3d0e6701a2c19a81fce834e2: removes CEO/Cliente loading.tsx, replaces white backdrop with transparent 9px blur. Its first parent is #100's merge; the changes are combined in main.
- #101 OPEN, head 6104c42ff915b0d670771dd8f7dbdffed2ea299d: security RPC authorization migration, SQL QA test and audit report. No loader changes. Kept separate because this UX task explicitly excludes migrations/authorization. The reported disabled-employee access issue remains a separate security release dependency.
- Production alias starcarvalho.vercel.app resolves to dpl_23mXWzGvwyRqoGVAFyQUfqFRvQTw, READY, same #102 commit. Earlier PR comments reported deployment quota errors; later production succeeded. This does not prove remaining quota.

## Root cause
The previous fetch interceptor released on response headers, before response bodies, RSC streams and rendered data were complete. History mutations and pathname changes also prematurely cleared route work. Background requests were captured without visual relevance. The minimum and completion animation were short. Backdrop used 9px blur and an isolated ancestor.

## Implementation
Explicit idempotent operation tokens. A persistent provider owns React transitions for push/replace/refresh and waits for their committed completion. Links retain Next prefetch and onNavigate semantics. Forms retain React Server Actions/useFormStatus; same-origin GET filters navigate through the tracked router. Client foreground state registers through useGlobalPending, releasing on the commit containing results or errors. Initial parking forecast participates, subsequent polling does not.

The overlay checks current pending work each frame and requires two paint opportunities after the final commit. Time controls presentation only, never readiness. Progress is 0–55% over 700ms, 55–80% over the next 1500ms, then asymptotic to 95%. Minimum 900ms before a 280ms completion, with no extra hold at 100%. Reduced motion suppresses animated progress and decoration. Backdrop is 14px blur/saturation .85 with 10% tint, without isolation. Background content and portals become inert during visibility; focus and original inert states are restored.

No Auth/RLS, financial rules, migrations, endpoints or request bodies changed. Payment component edits only register pending UI state and route refreshes.

## Duplicate loader search
All 115 TSX files were fetched and examined remotely. No loading.tsx or Suspense fallback remains in src. No page skeleton remains. animate-pulse in the customer dashboard highlights payment/paid state, not loading, and was retained. Contextual button spinners and payment/notification state indicators remain underneath the sole global overlay; asynchronous payment waiting is not treated as a pending page load.

## Validation scope
CI retains lint, typecheck, production build, production dependency audit and every existing regression suite. Adds operation/progress tests and a Chromium desktop/mobile integration job using the actual provider/overlay, Next RSC navigation, all seven filter values, Server Action revalidation, GET forms, overlapping delayed data, errors, background exclusion and reduced motion. Test routes are materialized only in the disposable CI workspace, never committed under src or deployed to Vercel.

Pending until execution: CI results, visual screenshots review, authenticated CEO/Cliente/Frentista workflows, native browser back/forward coverage, production validation and deployment quota verification. A supplied email alone is not an authenticated test session. Do not interpret fixture tests as proof that every production flow passed.
