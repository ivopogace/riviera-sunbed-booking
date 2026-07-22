# Auth page reacts to live query-param changes (#300) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox syntax.

**Goal:** On the unified auth page (`/account/sign-in`), the header **Register** / **Sign in**
links (and the retired-route redirects) switch the card's `mode` / `audience` / `returnUrl`
live, even when the page is already open and Angular reuses the component on a query-param-only
soft navigation.

**Architecture:** Replace the one-shot `route.snapshot.queryParamMap` reads in `AuthPage`'s field
initializers with **live** sources driven by `toSignal(route.queryParamMap)`. `mode` and `audience`
become `linkedSignal`s (recompute on a live query-param change, still overridable by the in-card
toggle); `returnUrl` becomes a `computed`. A single `effect` owns the reset-on-change behaviour
(R-6 password clear on any audience change; error clear on either change), so it fires for both the
in-card toggle and a live nav.

**Persistence:** N/A — frontend-only, no DB (invariant #1 not in scope).

**Source of intent:** GitHub issue #300.

**Skills consulted:** `riviera-frontend` (`auth-page.ts` stays in the `auth/` feature folder — pure
logic change, no file moves; e2e stays in the CI-safe `frontend/e2e/` mocked suite), `angular-developer`
+ angular-cli MCP `get_best_practices` (v22 `linkedSignal` / `toSignal` / `effect` are the correct
signal APIs; write-in-effect is allowed by default in v22), `playwright-cli` (soft-nav e2e authored in
the mocked unified-auth suite), `riviera-local-debug` (`npm run lint` + `npm test`, e2e mocked suite),
`riviera-plan-doc` (this doc).

**Branch:** `bugfix/auth-page-live-query-params` — cloud session substitutes the designated remote
branch **`claude/sdlc-300-khtyw9`**; develop and push there.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the user is on `/account/sign-in` (sign-in view, `mode = signin`), when a
  `queryParamMap` change carrying `mode=register` is emitted post-mount, then the card switches to
  the register view (`mode()` → `register`). *Pinned by:* `AuthPage` unit spec
  "reacts to a live mode query-param change after mount".
- [ ] **AC-2:** Symmetric — given the register view, when a `queryParamMap` change dropping `mode`
  is emitted, then the card returns to the sign-in view. *Pinned by:* `AuthPage` unit spec
  "reverts to sign-in when the mode param is cleared".
- [ ] **AC-3:** Given the user is on `/account/sign-in` (sign-in view), when they click the header
  **Register** link (a query-param-only soft nav, not a full page load), then the register view
  opens; and symmetrically the header **Sign in** link returns to the sign-in view. *Pinned by:*
  `unified-auth.e2e.ts` "the header Register / Sign-in links switch the card mode via soft nav".
- [ ] **AC-4:** Given the page is already open, when a live query-param change sets `audience=operator`
  and/or a new `returnUrl`, then the audience switches (identifier label → "Username") and the new
  `returnUrl` is honoured on the next successful sign-in. *Pinned by:* `AuthPage` unit specs
  "reacts to a live audience query-param change" and "honours a live returnUrl query-param change".
- [ ] **AC-5:** R-6 preserved — given a password typed while the audience is tourist, when the
  audience changes (by toggle **or** live query param), then the password field is cleared before any
  submit can post it to the other principal's endpoint. *Pinned by:* `AuthPage` unit specs
  "clears the password when the audience switches" (existing) + "clears the password on a live audience
  query-param change".

## Non-goals

- Making the **in-card** "Create one / Sign in" toggle write the query param (URL as single source of
  truth). We keep the surgical `linkedSignal` approach; the in-card toggle stays a local `.set()`, as
  today. A contrived header→in-card→header path where the URL and view diverge is out of scope (see
  Open questions).
- Any backend / D-2 change: still two principal types, two login endpoints, audience picks the client
  service only (R-6). No auth-flow behaviour change beyond reacting to the live params.
- Touching the SSO redirect, forgot/reset flows, or the operator landing rules.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — no surface retired or replaced`. This is a bug fix on the existing `AuthPage`; all four flows
and their handlers are preserved. The only behaviour change is the intended one: the page now honours a
live query-param change instead of ignoring it.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `linkedSignal` resets the in-card toggle's value when `queryParamMap` re-emits for an unrelated reason | low | med | `queryParamMap` only emits on navigation; in-card `.set()` holds until the next real nav. Covered by existing toggle unit tests staying green. | claude | open |
| R-2 | R-6 regression — password carried across a live audience change | low | high | Single `effect` clears the password on **any** audience change (toggle or nav); pinned by AC-5 (two tests). | claude | open |
| R-3 | `toSignal(..., {requireSync:true})` throws if the source doesn't emit synchronously | low | med | `ActivatedRoute.queryParamMap` is a replay/behavior-backed observable (sync first emission); unit fake uses a `BehaviorSubject`. | claude | open |
| R-4 | Effect writing to signals disallowed | low | low | v22 allows signal writes in effects by default (no `allowSignalWrites`); confirmed via angular-cli best-practices. | claude | open |

## Open questions / Assumptions

- **Assumption:** The header links only ever change `mode` (not `audience`); the live-`audience` path
  comes solely from the retired-route redirects, which land on a fresh/empty form — so R-6 password
  carry-over there is defensive, not a live UX path. *Owner:* claude · *Resolves by:* implement.
- **Open question (accepted limitation, not blocking):** header→in-card-toggle→header on the *same*
  URL produces no navigation (Angular skips identical-URL navs), so the second header click is a no-op.
  This is a rare, contrived path outside the issue's ACs; a full fix needs URL-as-source-of-truth
  (Non-goal). *Owner:* claude · *Resolves by:* noted here; file a follow-up only if it recurs.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability`. No booking, beach map, or `availability` write path is touched.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only`. No backend Java in scope.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/auth-page.ts` | existing | standalone component | `toSignal` + `linkedSignal` + `computed` + one `effect` | Signal Forms (unchanged) |

**Standards:** standalone, `inject()`, `@if`/`@switch`, signal APIs. `toSignal` from
`@angular/core/rxjs-interop`; `linkedSignal` / `effect` from `@angular/core`. No template change beyond
what the existing bindings already read (`mode()`, `audience()`).

## FE↔BE contract

`N/A — no contract change`. No endpoint or DTO change; the client still reads `mode`/`audience`/
`returnUrl` from the URL it already owns.

## Execution status

**Stage pointer:** `implement (phase 1)` — phase 0 green (unit + a11y specs), writing the soft-nav e2e next.

**Next action:** Add the soft-nav header-link spec to `unified-auth.e2e.ts` (AC-3); run/commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Live query-param reactivity + unit specs | ✅ | (this commit) |
| 1 — Soft-nav e2e coverage | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/app/auth/auth-page.ts` — swap snapshot reads for live sources; add the reset effect.
- `frontend/src/app/auth/auth-page.spec.ts` — `BehaviorSubject`-backed fake route; new live-change specs.
- `frontend/e2e/unified-auth.e2e.ts` — soft-nav header-link spec (AC-3).

---

## Phase 0 — Live query-param reactivity + unit specs

**Files:** Modify `auth/auth-page.ts` · `auth/auth-page.spec.ts`

- [ ] **Step 1:** Rework the spec's fake `ActivatedRoute` to expose a `BehaviorSubject<ParamMap>` as
  `queryParamMap` (keep `snapshot.queryParamMap` for safety); add the AC-1/2/4/5 live-change specs.
- [ ] **Step 2:** `npm test` (scoped to auth-page) → FAIL (snapshot reads ignore live emissions).
- [ ] **Step 3:** In `AuthPage`, add `queryParams = toSignal(route.queryParamMap, {requireSync:true})`;
  make `mode`/`audience` `linkedSignal`s off it, `returnUrl` a `computed`; add the reset `effect`;
  update `returnUrl` call sites to `returnUrl()`; slim `onAudienceChange` to defer the reset to the effect.
- [ ] **Step 4:** `npm test` (auth-page + a11y + contrast) → PASS.
- [ ] **Step 5:** Generalization audit — grep for other `route.snapshot.queryParamMap` field reads that
  should be live; record decision.
- [ ] **Step 6:** `npm run lint` → clean; commit.
- [ ] **Step 7:** Update execution status.

## Phase 1 — Soft-nav e2e coverage

**Files:** Modify `frontend/e2e/unified-auth.e2e.ts`

- [ ] **Step 1:** Add a spec that goes to `/account/sign-in`, clicks `nav-register` (soft nav), asserts
  the register heading + URL, then clicks `nav-signin` and asserts the sign-in heading + URL; axe-clean.
- [ ] **Step 2:** Run the mocked e2e (or note CI ownership if the sandbox can't run Chromium); commit.
- [ ] **Step 3:** Update execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-22 | Phase 0 (#300 fix) | field/init reads of `route.snapshot` params that go stale on a soft nav | `grep -rn 'snapshot.queryParamMap\|snapshot.paramMap' src/app --include='*.ts'` | `parent-venue-id`, `operator-console`, `venue-map` (path params → new route instance); `reset-password`, `verify-email`, `venue-map` `?date=`, `operator-home` `?returnUrl=` (seed-once-from-deep-link, then local state) | Skip — none exposes the URL query param as a *live in-app affordance on a reused component* the way the auth header links do; they're path-param (different route) or seed-once patterns. No sibling bug. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..5:** `npm test` (auth-page specs) green; `unified-auth.e2e.ts` soft-nav spec green (CI).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders anywhere.
- [ ] Backend invariants: N/A (frontend-only) — no JPA, no availability/payment/modulith surface touched.
- [ ] Frontend standards met; no `as any`; R-6 preserved.
- [ ] Execution status at HEAD matches reality.
- [ ] Open Questions empty or deferred with rationale.
