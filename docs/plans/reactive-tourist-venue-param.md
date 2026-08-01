# Reactive tourist venue param (#499) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tourist beach map (`/venues/:id`, `venue-map.ts`) reacts to an in-place
`:id` route-param change (reused component instance) — and to a route-carried `?date`
change in the same pass — by resetting per-venue state and re-loading, so a future
in-app venue→venue link cannot pin the map, pricing, availability or booking dialog
to a stale venue.

**Architecture:** Mirror the shipped #495 pattern exactly: derive the id from a
`toSignal(route.paramMap)` computed (the `shared/parent-venue-id.ts` helpers,
generalized to a non-`venueId` param name — the refactor #499 anticipated), reset
per-venue state and re-load from a constructor `effect`, and guard every async
continuation with a per-component **epoch** captured at operation start (identity, not
a param-value comparison — the A→B→A recurrence class, `ConsoleVenueMap`'s #487
precedent). The v22 routing docs endorse observing `paramMap` over snapshot reads for
reused instances ("snapshots are static and will not reflect future changes" —
angular.dev/guide/routing/read-route-state, via the angular-cli MCP). The `?date`
query param joins the same reset effect via `toSignal(route.queryParamMap)`: a route
emission whose venue id **or** validated date changed resets to the fresh-mount state;
the local date-picker keeps writing `selectedDate` directly (no URL write-back — same
as today).

**Persistence:** JDBC only (invariant #1). N/A — frontend-only slice, no tables touched.

**Source of intent:** GitHub issue #499 (deferred from #180 / PR #495, recorded there
as a Non-goal + Generalization-audit row).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the issue's line numbers/claims against today's code, found the 3 snapshot-only route
mocks that will crash under `toSignal`, and that only Dependabot PRs are in flight) ·
`riviera-plan-doc` (this template — forced the reset-state audit and the
date-semantics decision into ACs/risks instead of code comments) · `tdd` (each phase
red-green: failing param-change spec first, then the reactive read) ·
`riviera-review-overlay` (review gate — to run at ready-for-review) ·
`riviera-docs-freshness` (to run pre-merge over `origin/main...HEAD`; expected surface:
the `riviera-frontend` routing bullet describes `parent-venue-id.ts` as venue-scoped) ·
`riviera-frontend` (placement: the generalized helper stays in `shared/` — pure,
stateless; the harness spec lives in `venue/`; no new cross-feature edges — the
existing `venue-map` → `booking/booking-dialog` edge is in the frozen RV-FE-8 table) ·
`angular-developer` + angular-cli MCP (`list_projects` v22; `get_best_practices`;
`search_documentation` "read route state" — the snapshot-vs-observable guidance cited
above) · `playwright-cli` (consulted for the e2e decision — no user-reachable
venue→venue tourist flow exists, so no e2e spec can exercise the change; see
Non-goals) · `riviera-local-debug` (loaded before the session's first `npm` run —
scoped Vitest runs, CI owns the full suite).

**Branch:** `claude/angular-mcp-search-document-sdfwtf` — the session's designated
remote branch stands in for `bugfix/reactive-tourist-venue-param` (cloud-session
addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (id reacts + state resets):** Given the map rendered for venue 1 with a
  set's booking dialog open, when the route's `paramMap` emits `id=2` without the
  component being destroyed, then the dialog closes, the venue-1 map clears (loading
  state), and venue 2's map is fetched for the current route date and rendered.
  *Pinned by:* `venue-map.spec.ts` › "re-loads and resets when the venue param
  changes in place (#499)"
- [x] **AC-2 (superseded responses dropped, identity-guarded):** Given a venue-1 map
  load still in flight, when the param switches to venue 2 — including an A→B→A
  switch back to venue 1 — then the superseded response never lands in the view
  (epoch identity, not param-value comparison). *Pinned by:* `venue-map.spec.ts` ›
  "drops a superseded venue's late response (#499)" and "drops a stale first-visit
  response after an A→B→A switch (#499)"
- [x] **AC-3 (route date re-seeds):** Given the map rendered on date D (route-seeded
  or picker-chosen), when a route emission carries a different valid `?date=E` on/after
  the booking floor, then the map resets to E and fetches E's availability; a
  malformed or past `?date` falls back to the floor (invariant #4, display). *Pinned
  by:* `venue-map.spec.ts` › "re-seeds the date from the ?date param on an in-place
  navigation (#499)"
- [x] **AC-4 (invalid param transition + recovery):** Given the map rendered for a
  valid venue, when the param turns non-numeric, then the failure panel shows; when a
  valid id then arrives, the map recovers and loads it. *Pinned by:*
  `venue-map.spec.ts` › "fails fast when the param turns invalid and recovers (#499)"
- [x] **AC-5 (fresh-navigation parity):** Given a fresh navigation to `/venues/:id`
  (the only flow that exists today), when the component constructs, then behavior is
  unchanged: one load for the seeded date, `?date` honored/clamped exactly as before.
  *Pinned by:* the existing `venue-map.spec.ts` + `venue-map.a11y.spec.ts` suites
  staying green, unmodified in intent (route mocks upgraded only).
- [x] **AC-6 (real route config, end to end):** Given the real `app.routes.ts` config
  under `RouterTestingHarness`, when navigating `/venues/1` → `/venues/2`, then the
  same `VenueMap` instance is reused and venue 2's name renders off a venue-2 HTTP
  load. *Pinned by:* `venue/venue-map-switch.spec.ts`

## Non-goals

- **No venue→venue UI link.** This slice makes a future "similar venues nearby" /
  next-venue affordance safe; it does not build one.
- **No e2e spec.** With no user-reachable venue→venue tourist navigation, no
  Playwright flow can exercise the change; AC-6's `RouterTestingHarness` spec over the
  real route config is the integration proof instead — the exact #495 precedent.
  (RV-FE-E2E: recorded here, to be confirmed at the review gate.)
- **No URL write-back of the picker's date.** The date input keeps writing
  `selectedDate` only; syncing `?date=` into the URL is a separate UX decision.
- **No operator-side change.** The console shipped this in #495; `venueIdParam` /
  `parentVenueId` keep their exact signatures and behavior.
- **No `RouteReuseStrategy`.** Rejected with the user in #180's plan; unchanged.
- **No backend change.**

## Behavior-parity ledger (retirement / replacement slices only)

N/A in the retirement sense — the same component gains reactivity — but the
constructor path is rebuilt, so the fresh-mount behaviors are enumerated:

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| Non-numeric `:id` → fail fast, no `/venues/NaN` request | preserved (strengthened) | the helper's validation also rejects `0`/negatives — previously these issued a doomed request that ended in the same failure panel; now the panel shows without the request |
| `?date` honored when valid and ≥ floor, else floor (tomorrow, Tirane) | preserved | same validation, now in the `routeDate` computed |
| One load per fresh mount | preserved | the reset effect's first run is the mount load (AC-5 pins) |
| Date-picker change: dialog closed, re-fetch, map stays rendered while loading | preserved | `onDateChange` unchanged — picker changes do not blank the map; only route emissions reset |
| Last-writer-wins across rapid picker date switches | preserved | the `selectedDate() === requested` guard stays, now joined by the epoch guard |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Per-venue transient state leaks across a switch (open dialog, `lastTriggerId` focus target, pan-gesture flags, stale map while venue 2 loads) | med | high | `resetForVenue` clears every venue-scoped signal + imperative field; AC-1 asserts the dialog + map reset | Claude | closed — reset audit pinned (phase 1); review confirmed completeness incl. `scrollHint` self-correcting via `afterRenderEffect` |
| R-2 | `toSignal(paramMap/queryParamMap)` subscribes at construction — the 3 snapshot-only route mocks (`venue-map.spec.ts` ×2 sites, `venue-map.a11y.spec.ts`) crash | high | low | Sweep the mocks to `BehaviorSubject`-backed ones in phase 1; red Vitest run catches stragglers | Claude | closed — 3 mock sites patched at phase 1 |
| R-3 | A same-value `?date` route emission after a local picker change does not reset — fresh-mount parity edge | low | low | Narrowed by review F-1's raw-param key: any emission whose RAW `?date` differs now resets; the only remaining skip is a same-raw-value emission, which the router does not deliver for a same-URL navigation | Claude | closed — residual is unreachable by the router's own semantics |
| R-4 | Blanking the map on reset regresses an existing flow | low | med | Only route emissions reset; the picker path is untouched (parity ledger row); AC-5 pins existing suites unmodified | Claude | closed — existing suites green, unmodified in intent |
| R-5 | The helper generalization changes operator-side behavior | low | high | `venueIdParam`/`parentVenueId` become one-line delegates with identical signatures; the untouched operator + shared suites stay green | Claude | closed — full FE suite (1065 tests incl. all operator specs) green |

## Open questions / Assumptions

### Resolved

- **Assumption:** seeding `selectedDate` with the floor and letting the constructor
  reset apply the route date before first render is flash-free. — **Resolved at
  phase 2:** the fresh-mount load stays synchronous in the constructor (design note in
  the phase-1 row), so the seed happens before the first render; AC-5 suites green
  ("Re-seed the tourist map date from route emissions (#499)").

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The map re-issues the existing **read**
(`GET /api/venues/{id}?date=`) for a different venue/date; no
`availability(set_id, booking_date)` write path is touched. Display parity only:
availability truth stays server-side.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability added or moved. FE changes stay inside
`venue/` + the existing `shared/` helper (no new cross-feature edges; the
`venue-map` → `booking-dialog` edge predates this slice and is frozen in RV-FE-8).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/parent-venue-id.ts` | existing | pure helper | new `routeIdParam(route, param)` core; `venueIdParam` delegates with `'venueId'` | — |
| FE-2 | `venue/venue-map.ts` | existing | standalone component | `venueId` signal from own-route `paramMap` (`'id'`); `routeDate` computed from `queryParamMap`; reset `effect` + epoch guard | — |
| FE-3 | `venue/venue-map-switch.spec.ts` | new | `RouterTestingHarness` integration spec | real `app.routes.ts` config | — |

**Standards:** standalone components, `inject()`, signals; no `as any`. Deviation:
none.

## FE↔BE contract

N/A — no contract change; the same endpoint is called with a different `venueId`/date.

## Execution status

**Stage pointer:** DONE — merged via PR #500

**Next action:** none — slice complete (issue #499 closed by the merge)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `routeIdParam` helper generalization | ✅ | "Generalize the route-id-param helper to any param name (#499)" — `venueIdParam` is now a one-line delegate (R-5 mitigated by signature parity); 9 shared tests green; generalization audit logged (no further in-scope snapshot readers) |
| 1 — reactive `:id` + epoch guard in `VenueMap` | ✅ | "React to in-place venue param changes on the tourist map (#499)" — AC-1/2/4 pinned (incl. the A→B→A identity case); design note: the fresh-mount load stays synchronous in the constructor (AC-5 parity — ~30 existing specs assert the immediate request), the effect resets only when the id *value* differs from the loaded context; R-1 reset audit + R-2 mock sweep (3 sites) done; 62 venue-folder tests green |
| 2 — reactive `?date` re-seed | ✅ | "Re-seed the tourist map date from route emissions (#499)" — AC-3 pinned (valid carried date + below-floor clamp); `readInitialDate()` folded into the `routeDate` computed; the reset effect keys on the `(id, routeDate)` value pair; Open-questions assumption resolved (no flash — `selectedDate` is seeded from `routeDate` at field init, the constructor reset is a same-value write); 73 venue+shared tests green |
| 3 — harness switch spec over real routes | ✅ | "Pin the tourist venue switch on the real routes (#499)" — AC-6: `venue-map-switch.spec.ts` asserts instance REUSE + venue-2 reload under the real `app.routes.ts` config (the `console-venue-switch.spec.ts` mirror) |
| 4 — lint + full FE suite + gates + close-out | ✅ | lint clean; full FE suite 131 files / 1065 tests green; build error-free (two pre-existing SCSS budget warnings only); `main` unmoved; CI green per push; review + Sonar gates run at ready-for-review, findings fixed in "Guard per dispatch and re-derive the booking floor per reset (#499)"; docs-freshness pre-merge smoke ran over `origin/main...HEAD` — zero findings (no substrate statement contradicted; no counted set grew) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` fan-out, 5 agents + scoring; 75) | The #487 class one level down: `epoch` bumped per reset only, so two in-flight loads for the same `(venue, date)` (picker A→B→A within one venue) were indistinguishable — a stale same-date success could resurrect a map whose freshest load failed | fixed — `epoch` now increments per `load()` dispatch (subsuming the date value check); pinned by "drops a stale same-date response from before a picker round trip" |
| F-2 | review (git-history agent; 72) | `minDate` was constructor-frozen while the instance now outlives navigations — a reset after Tirane midnight clamped `?date` against yesterday's floor and re-seeded a stale fallback (the operator pattern re-reads the clock per reset; the port dropped that) | fixed — `minDate` is a signal re-derived from a fresh clock in `resetForVenue`; pinned by "re-derives the booking floor at an in-place switch after midnight" |
| F-3 | review (RV-STYLE-1, Minor ×3) | multi-line inline comments added by the diff (constructor, `load()`, one spec) | fixed — collapsed to one line each; rationale lives in the exempt TSDoc |
| F-4 | review (comment agent, 50) | TSDoc drift: "every in-place route change" overstated the reset trigger; "The venue" for a venue id; `epoch` "per venue context"; the reset enumeration omitted the date re-seed; class doc silent on the new reactivity | fixed — all five reworded to match the code |
| F-5 | review (advisory) | `selectedDate` is nearly the `linkedSignal` shape | no change, with rationale: a `linkedSignal` over `routeDate` alone would not re-seed on a venue-only switch; the explicit reset keys on the raw route context and stays uniform with the #495 tabs |

---

## File structure

- `frontend/src/app/shared/parent-venue-id.ts` — generalized core
  `routeIdParam(route | null, param)`; `venueIdParam` delegates (`'venueId'`),
  `parentVenueId` unchanged in behavior.
- `frontend/src/app/shared/parent-venue-id.spec.ts` — extended: `routeIdParam` with a
  non-`venueId` param name (read, re-emit, validation).
- `frontend/src/app/venue/venue-map.ts` — reactive `venueId` + `routeDate`, reset
  effect, epoch continuation guards; `readInitialDate()` folded into `routeDate`.
- `frontend/src/app/venue/venue-map.spec.ts` / `venue-map.a11y.spec.ts` — route mocks
  gain live `paramMap`/`queryParamMap`; new #499 param-change specs.
- `frontend/src/app/venue/venue-map-switch.spec.ts` — new harness spec (AC-6).

---

## Phase 0 — `routeIdParam` helper generalization

**Files:** Modify `shared/parent-venue-id.ts` · Test `shared/parent-venue-id.spec.ts`

- [ ] **Step 1: failing spec** — `routeIdParam(route, 'id')` reads `:id`, re-emits on
  change, `undefined` on non-numeric/non-positive.
- [ ] **Step 2: verify red** — `npm test -- --include '**/parent-venue-id.spec.ts'`
- [ ] **Step 3: implement** — extract the param name; `venueIdParam(route)` =
  `routeIdParam(route, 'venueId')`; TSDoc notes the #499 generalization.
- [ ] **Step 4: verify green** — same command + the untouched operator suites later at
  phase 4's full run (R-5).
- [ ] **Step 5: generalization audit** — remaining snapshot readers
  (`verify-email.ts`, `reset-password.ts`, `operator-home.ts` `returnUrl`) are
  one-shot full-page flows with no reuse path — log below, no action.
- [ ] **Step 6: commit** — `Generalize the route-id-param helper to any param name (#499)`
  — then **open the draft PR** (CI vehicle).
- [ ] **Step 7: execution status** updated in the same commit window.

## Phase 1 — Reactive `:id` + epoch guard in `VenueMap`

**Files:** Modify `venue/venue-map.ts` · Test `venue-map.spec.ts`,
`venue-map.a11y.spec.ts`

- [ ] **Step 1: failing specs** — AC-1 (reset + reload), AC-2 (late response; A→B→A),
  AC-4 (invalid → recovery), on a `BehaviorSubject`-backed route mock; sweep the 3
  snapshot-only mocks (R-2).
- [ ] **Step 2: verify red** — `npm test -- --include '**/venue-map.spec.ts'`
- [ ] **Step 3: implement** — `venueId = routeIdParam(this.route, 'id')`; constructor
  `effect` → `untracked(resetForRoute)`; `epoch` bumped per reset; `load()` guards
  continuations with `epoch` + the existing requested-date check.
- [ ] **Step 4: verify green** — venue-map spec + a11y spec.
- [ ] **Step 5: generalization audit** — the pattern is this plan; no new sites.
- [ ] **Step 6: commit** — `React to in-place venue param changes on the tourist map (#499)`
- [ ] **Step 7: execution status** updated.

## Phase 2 — Reactive `?date` re-seed

**Files:** Modify `venue/venue-map.ts` · Test `venue-map.spec.ts`

- [ ] Red-green: AC-3 spec (route emission with new valid date → reset + fetch;
  malformed/past → floor) → `routeDate` computed from `toSignal(queryParamMap)`,
  tracked by the same reset effect; `readInitialDate()` removed.
- [ ] **Commit** — `Re-seed the tourist map date from route emissions (#499)`
- [x] Execution status updated.

## Phase 3 — Harness switch spec over real routes

**Files:** Create `venue/venue-map-switch.spec.ts`

- [ ] AC-6: `RouterTestingHarness` + `provideRouter(routes)` from `app.routes.ts`,
  `HttpTestingController`; navigate `/venues/1` → `/venues/2`; assert instance reuse,
  venue-2 GET, venue-2 name rendered.
- [ ] **Commit** — `Pin the tourist venue switch on the real routes (#499)`
- [x] Execution status updated.

## Phase 4 — Suite green + gates + close-out

- [ ] `npm run lint` · `npm test` (full, once) · `npm run build` — green locally.
- [ ] Merge latest `origin/main` if moved; push; verify the PR's CI run.
- [ ] Mark PR ready for review → Review gate (`/code-review` ladder) + Sonar gate per
  `references/pr-gates.md`; findings re-enter at Implement.
- [ ] Close-out: finalize Execution status (`merged via PR #NN`),
  `riviera-docs-freshness` over the branch range, issue #499 closed by the PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | review fix F-1 (per-dispatch generation) | other continuation guards comparing per-reset state by value | read of every `subscribe`/`await` continuation in `venue-map.ts` (review agents' sweep) | `load()` is the component's only async continuation; dialog callbacks write no venue state | fixed the one site; F-2's fresh-floor fix applied to the same reset path |
| 2026-08-01 | plan (grill) | constructor-snapshot route reads | `grep -rn "snapshot\.\(paramMap\|queryParamMap\)" frontend/src` | `venue-map.ts` (this slice); `verify-email.ts`, `reset-password.ts`, `operator-home.ts` (one-shot full-page flows, no reuse path) | fix `venue-map`; others deliberately out — a token/returnUrl read on a flow the router never param-swaps |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-5:** `npm test -- --include 'src/app/venue/**/*.spec.ts' --include
  'src/app/shared/parent-venue-id.spec.ts'` → green incl. the #499 cases.
- [x] **AC-6:** `npm test -- --include 'src/app/venue/venue-map-switch.spec.ts'` →
  green (instance reuse + venue-2 reload on the real routes).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — display floor unchanged.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** justified N/A (invariants #5, #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: `defaultBookingDate` usage unchanged (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] Flyway N/A (invariant #12).
- [x] **Frontend** standards met; no `as any`; RV-FE-8 table unchanged.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** (`merged via PR #NN`).
- [x] **The review gate ran in full** per `references/pr-gates.md` §1.
