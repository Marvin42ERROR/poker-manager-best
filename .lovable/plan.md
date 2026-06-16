# Final Security Scan Report

Re-ran the full scan across **agent_security**, **connector_security_scan (incl. Wiz)**, **supabase**, **supabase_lov**, and **tanstack**.

## Result

| Scanner | Findings | Status |
|---|---|---|
| connector_security_scan (Wiz, etc.) | 0 | clean |
| agent_security | 0 | clean |
| supabase_lov | 0 | clean |
| supabase (linter) | 2 | **previously ignored** — `start_support_session` / `end_support_session` are `SECURITY DEFINER` by design; both enforce `is_creator(auth.uid())` internally and must be client-callable by the Creator. |
| tanstack | 1 | **NEW — needs fix** (see below) |

So it is **not** a zero-issues report yet. One new finding surfaced, and two pre-existing items remain intentionally ignored with documented rationale in security memory.

## New finding: `ROUTE_GUARD_SSR_BYPASS` (warn)

Every guard in `src/lib/auth-guards.ts` (`requireAuth`, `requireAdmin`, `requireCreator`, `redirectIfAuthed`) starts with:

```ts
if (typeof window === "undefined") return;
```

During SSR the guard returns without redirecting, so the HTML shell of protected pages (`/games`, `/players`, `/cash`, `/expenses`, `/select-club`) is rendered and sent to the wire before client-side hydration enforces the check.

Today this leaks only structural markup (no row data — the poker store lives in `localStorage`), but the moment any protected route adds a server loader that reads Supabase, that data would also slip through. It needs to be fixed before that happens.

## Proposed fix

Disable SSR on protected route files and keep the client guards as the single enforcement point. This is the TanStack-recommended pattern for routes whose auth lives in `localStorage` (the server has no session to check anyway).

Add `ssr: false` to the `createFileRoute` config of:

- `src/routes/games.tsx`
- `src/routes/players.tsx`
- `src/routes/cash.tsx`
- `src/routes/expenses.tsx`
- `src/routes/select-club.tsx`
- `src/routes/no-access.tsx`

Leave public routes (`/`, `/login`) SSR-on.

The existing `typeof window === "undefined"` early-return in the guards stays — it now becomes a defensive no-op because `beforeLoad` runs client-side only.

## Then re-run the scan

After the fix, re-run `security--run_security_scan`. Expected final state:

- connector_security_scan (Wiz): 0
- agent_security: 0
- supabase_lov: 0
- tanstack: 0
- supabase: 2 (intentional, ignored — same two SECURITY DEFINER warnings)

That is the closest this project can get to a zero-issues report without removing the Creator Support-Mode feature.

## Out of scope

- Re-architecting routes under `_authenticated/` (bigger refactor; same effective outcome).
- Moving auth state out of `localStorage` to cookies (would unlock true SSR auth, but is a separate roadmap item).
