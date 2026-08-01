# Reactive console venue param (#180) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operator console shell AND its six tabs react to an in-place `:venueId`
route-param change (same reused component instances) by re-loading for the new venue,
so a future in-app venue switcher cannot pin the console to a stale venue.

**Architecture:** Replace the constructor-snapshot read of `:venueId` with the
docs-endorsed reactive pattern — a `Signal<number | undefined>` derived from
`ActivatedRoute.paramMap` via `toSignal`, mirroring the shipped `booking-view`
`paramMap` reload (#167). A shared helper (`shared/parent-venue-id.ts`, generalized to
accept the route *or* its parent) keeps validation in one place; each component drives
its loads from an `effect` on that signal. A scoped `RouteReuseStrategy` alternative
was considered and rejected with the user (2026-08-01): Angular's routing guides endorse
observing `paramMap`, and the repo precedent (#167, #300) is "read params live".

**Persistence:** JDBC only (invariant #1). N/A — frontend-only slice, no tables touched.

**Source of intent:** GitHub issue #180 (deferred from the O1 #170 review gate,
finding 3), parent epic #141.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught
that the fix scope grew from the shell to shell + six tabs, all snapshot-readers via
`parentVenueId`, and that no in-app console→console navigation exists yet, making e2e
coverage inapplicable) · `riviera-plan-doc` (this template — forced the per-tab
transient-state reset audit into the ACs/risks) · `tdd` (each phase red-green: failing
param-change spec first, then the reactive read) · `riviera-review-overlay` (review
gate — pending, at ready-for-review; RV-FE-E2E consulted for the e2e-N/A claim) ·
`riviera-docs-freshness` (pending — run at merge close-out over this branch's range;
tab TSDoc "reads once, like StaffDaily" phrases go stale in-diff) · `riviera-frontend`
(placement: the helper stays in `shared/` — pure, stateless; no new cross-feature
edges; `app.config.ts` untouched since the reuse-strategy option was rejected) ·
`angular-developer` + angular-cli MCP (`list_projects` v22; `search_documentation` —
"Read route state" endorses observing `paramMap` over snapshot for reused instances;
`RouterTestingHarness` for the real-route integration spec) · `playwright-cli`
(consulted for the e2e decision — no user-reachable console→console flow exists, so no
e2e spec can exercise the change; see Non-goals) · `riviera-local-debug` (loaded before
the session's first `npm` run — scoped Vitest runs, CI owns the full suite).

**Branch:** `claude/sdlc-180-staleness-check-hmu4ib` — the session's designated remote
branch stands in for `bugfix/reactive-console-venue-param` (cloud-session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (shell reacts):** Given the console shell rendered for venue 1 (signed
  in, header shows venue 1's name), when the route's `paramMap` emits `venueId=2`
  without the component being destroyed, then the shell re-loads: the header title and
  Requests badge are re-fetched for venue 2 and every tab `routerLink` targets
  `/operator/2/<tab>`. *Pinned by:* `operator-console.spec.ts` › "reloads the header
  and badge when the venue param changes in place (#180)"
- [ ] **AC-2 (tabs react):** Given a console tab rendered for venue 1, when the
  **parent** route's `paramMap` emits `venueId=2`, then the tab re-fetches its data for
  venue 2 and its per-venue transient state is reset (no venue-1 leftovers). *Pinned
  by:* one "re-loads when the parent venue param changes (#180)" spec in each of
  `layout-editor.spec.ts`, `pricing-tab.spec.ts`, `daily-view-tab.spec.ts`,
  `requests-tab.spec.ts`, `payouts-tab.spec.ts`, `venue-tab.spec.ts`
- [ ] **AC-3 (invalid param transition):** Given the shell rendered for a valid venue,
  when the param changes to a non-numeric/non-positive segment, then the shell shows
  the existing not-found state (and recovers when a valid id arrives). *Pinned by:*
  `operator-console.spec.ts` › "shows not-found when the param turns invalid (#180)"
- [ ] **AC-4 (construction behavior unchanged):** Given a fresh navigation to the
  console (the only flow that exists today), when the component constructs with the
  async `/me` session restore resolving later, then exactly one load runs once the
  session exists — the #109 behavior. *Pinned by:* the existing `operator-console.spec.ts`
  suite staying green, unmodified in intent.
- [ ] **AC-5 (real route config, end to end):** Given the real `app.routes.ts` config
  under `RouterTestingHarness`, when navigating `/operator/1/beach-map` →
  `/operator/2/beach-map`, then the shell shows venue 2's name and venue-2 HTTP loads
  are issued (shell + tab), proving the fix under the router's actual reuse behavior.
  *Pinned by:* `operator/console-venue-switch.spec.ts`

## Non-goals

- **No venue-switcher UI.** This slice makes a future switcher safe; it does not build
  one. The console header keeps no link to `/operator` or to sibling venues.
- **No e2e spec.** With no user-reachable console→console navigation, no Playwright
  flow can exercise the change; AC-5's `RouterTestingHarness` spec over the real route
  config is the integration proof instead. (RV-FE-E2E: recorded here, to be confirmed
  at the review gate.)
- **No `RouteReuseStrategy`.** Considered and rejected with the user — see Architecture.
- **No change to `venue-map.ts`'s own snapshot read** (`/venue/:id`, tourist side) —
  same latent pattern, different surface, out of #180's scope; noted in the
  Generalization-audit log.
- **No backend change.**

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced; the same components gain reactivity. The
behavior-preservation concern is captured as AC-4 and R-3 instead.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Per-venue transient state leaks across a venue switch (daily `pendingSets`, requests `expired`, pricing per-row edit/saved flags, layout-editor draft grid, venue-tab form values, payouts `statementOpen`) | med | high | Per-tab reset audit in each tab's phase: `load` must overwrite or explicitly reset every venue-scoped signal; the AC-2 spec for each tab asserts a representative reset | Claude | open |
| R-2 | `toSignal(parent.paramMap)` subscribes at construction — every spec whose route mock lacks a `paramMap` observable crashes (≈12 spec files mock only `snapshot`) | high | low | Sweep all operator spec route mocks in the same phase as the code change; compiler + red Vitest run catches stragglers | Claude | open |
| R-3 | Double-load on init: an effect reading both `signedIn()` and `venueId()` must fire once per change, not once per source | low | med | Single `effect` reads both signals, loads via `untracked`; AC-4 pins the existing single-load behavior | Claude | open |
| R-4 | `ConsoleVenueMap` shared snapshot serves venue-1 data after the switch | low | med | It is keyed by `(venueId, date)` — a venue-2 load is a key miss and refetches; AC-5's harness spec observes the venue-2 HTTP call | Claude | open |
| R-5 | Layout-editor unsaved draft is silently discarded on a venue switch | med | low | Accepted: identical to today's full-page-navigation semantics; a dirty-guard is a future switcher-slice concern, not #180's | Claude | accepted |
| R-6 | Requests-badge race between the shell's re-seed and the tab's authoritative write on the same navigation | low | low | Existing `PendingRequestsStore` semantics unchanged: shell resets + seeds, a mounted Requests tab re-loads and `set`s; both are driven by the same param emission | Claude | open |

## Open questions / Assumptions

- **Assumption:** keeping the helper file at `shared/parent-venue-id.ts` (generalized
  signature, updated TSDoc) beats renaming it — six imports + specs stay put, and the
  name still describes the dominant (tab) use. — *Owner:* Claude · *Resolves by:* phase 0
- **Assumption:** `operatorSessionGuard` can be satisfied in the AC-5 harness spec by
  stubbing the session-auth seam it awaits (`whenReady`), not by overriding the route
  config. — *Owner:* Claude · *Resolves by:* phase 4

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The console re-issues existing **read** calls
(venue map, pending-request count, tab reads) for a different venue; no
`availability(set_id, booking_date)` write path is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability added or moved. All FE changes stay inside
`operator/` + the existing `shared/` helper (no new cross-feature edges — RV-FE-8 table
unchanged).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/parent-venue-id.ts` | existing | pure helper | returns `Signal<number \| undefined>` via `toSignal(paramMap)` | — |
| FE-2 | `operator/operator-console.ts` + `.html` | existing | standalone shell component | `venueId` becomes a `computed` from own-route `paramMap`; load `effect` keys on `signedIn()` + `venueId()` | — |
| FE-3 | `operator/layout-editor.ts` | existing | tab component | `venueId` signal + reload effect + draft reset | — |
| FE-4 | `operator/pricing-tab.ts` | existing | tab component | idem + per-row edit-state reset | — |
| FE-5 | `operator/daily-view-tab.ts` | existing | tab component | idem + `pendingSets` reset | — |
| FE-6 | `operator/requests-tab.ts` | existing | tab component | idem + `expired` reset | Reactive (existing) |
| FE-7 | `operator/payouts-tab.ts` | existing | tab component | idem + `statementOpen` reset | — |
| FE-8 | `operator/venue-tab.ts` | existing | tab component | idem + form re-seed | Reactive (existing) |
| FE-9 | `operator/console-venue-switch.spec.ts` | new | `RouterTestingHarness` integration spec | real `app.routes.ts` config | — |

**Standards:** standalone components, `inject()`, signals; no `as any`. Deviation:
none.

## FE↔BE contract

N/A — no contract change; the same endpoints are called with a different `venueId`.

## Execution status

**Stage pointer:** plan — plan doc authored, awaiting commit

**Next action:** commit this plan doc, then start phase 0 (helper spec first)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — signal-returning `parentVenueId` helper | | |
| 1 — reactive shell (`operator-console`) | | |
| 2 — tabs: layout-editor + pricing | | |
| 3 — tabs: daily-view + requests | | |
| 4 — tabs: payouts + venue-tab; harness integration spec | | |
| 5 — lint + full FE suite + PR ready-for-review | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/shared/parent-venue-id.ts` — generalized: `parentVenueId(route)`
  returns `Signal<number | undefined>` from `route.parent`; new sibling export
  `venueIdParam(route | null)` carries the shared logic so the shell can read its own
  route through the same validation.
- `frontend/src/app/shared/parent-venue-id.spec.ts` — extended: emission-driven cases.
- `frontend/src/app/operator/operator-console.ts` / `.html` — reactive `venueId`,
  reload effect, stale-header clear.
- `frontend/src/app/operator/{layout-editor,pricing-tab,daily-view-tab,requests-tab,payouts-tab,venue-tab}.ts`
  — reactive `venueId` + reload effect + transient-state reset.
- All co-located `.spec.ts` / `.a11y.spec.ts` — route mocks gain `paramMap`
  observables; one param-change spec per tab.
- `frontend/src/app/operator/console-venue-switch.spec.ts` — new harness spec (AC-5).

---

## Phase 0 — Signal-returning `parentVenueId` helper

**Files:** Modify `frontend/src/app/shared/parent-venue-id.ts` · Test
`frontend/src/app/shared/parent-venue-id.spec.ts`

- [ ] **Step 1: Write the failing test** — in `parent-venue-id.spec.ts`, alongside the
  existing snapshot cases (rewritten to read the signal):

```ts
it('re-emits when the parent param changes (#180)', () => {
  const params$ = new BehaviorSubject(convertToParamMap({ venueId: '1' }));
  const route = {
    parent: { snapshot: { paramMap: params$.value }, paramMap: params$ },
  } as unknown as ActivatedRoute;
  const id = TestBed.runInInjectionContext(() => parentVenueId(route));
  expect(id()).toBe(1);
  params$.next(convertToParamMap({ venueId: '2' }));
  expect(id()).toBe(2);
  params$.next(convertToParamMap({ venueId: 'foo' }));
  expect(id()).toBeUndefined();
});
```

- [ ] **Step 2: Run it, verify it fails** —
  `npm test -- --run parent-venue-id` → FAIL (returns `number`, not a signal)
- [ ] **Step 3: Minimal implementation**

```ts
export function venueIdParam(route: ActivatedRoute | null): Signal<number | undefined> {
  if (route === null) {
    return computed(() => undefined);
  }
  const params = toSignal(route.paramMap, { initialValue: route.snapshot.paramMap });
  return computed(() => toVenueId(params()));
}

export function parentVenueId(route: ActivatedRoute): Signal<number | undefined> {
  return venueIdParam(route.parent);
}

function toVenueId(params: ParamMap): number | undefined {
  const id = Number(params.get('venueId'));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
```

  (TSDoc updated: reactive since #180; the O1 non-inheritance note stays.) Tab call
  sites do not compile yet — phases 2–4 migrate them; until then the branch builds only
  phase-locally, so **phases 0+1+2 land as one push** if needed to keep CI green, or
  the helper temporarily keeps a `parentVenueIdSnapshot` shim. Decide at phase 0
  execution; record in the phase row.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- --run parent-venue-id` → PASS
- [ ] **Step 5: Generalization-audit pass** — search other snapshot-once param reads:
  `grep -rn "snapshot.paramMap" frontend/src/app --include='*.ts'` → known:
  `venue-map.ts` (tourist, out of scope — Non-goal), `verify-email.ts` /
  `reset-password.ts` (query params on full-page flows, no reuse path). Log below.
- [ ] **Step 6: Commit** — `git commit -m "Make parentVenueId a reactive signal (#180)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Reactive shell

**Files:** Modify `operator-console.ts`, `operator-console.html` · Test
`operator-console.spec.ts`, `operator-console.a11y.spec.ts`

- [ ] **Step 1: Failing specs** — AC-1 and AC-3, `BehaviorSubject`-backed route mock
  (the `booking-view.spec.ts:585` pattern): assert venue-2 name fetched, badge
  re-seeded, tab `href`s point at `/operator/2/...`, not-found on invalid.
- [ ] **Step 2: Verify red** — `npm test -- --run operator-console`
- [ ] **Step 3: Implement** — `venueId = venueIdParam(this.route)` (own route, not
  parent); single `effect` reads `signedIn()` + `venueId()`, loads via `untracked`;
  `load(id)` clears `venueName`/`venue` before fetching; template → `venueId()`;
  TSDoc drops "read once (like StaffDaily)".
- [ ] **Step 4: Verify green** — `npm test -- --run operator-console` (incl. a11y spec
  mock sweep, R-2)
- [ ] **Step 5: Generalization audit** — none new (pattern introduced here is the plan).
- [ ] **Step 6: Commit** — `git commit -m "React to venue param changes in the console shell (#180)"`
  — then **open the draft PR** (CI vehicle, riviera-sdlc PR rule).
- [ ] **Step 7: Execution status** updated.

## Phase 2 — Tabs: layout-editor + pricing

**Files:** Modify `layout-editor.ts`, `pricing-tab.ts` · Test their `.spec.ts` +
`.a11y.spec.ts`

- [ ] Per tab, red-green: failing "re-loads when the parent venue param changes (#180)"
  spec (parent `paramMap` `BehaviorSubject`; assert venue-2 fetch + reset: editor draft
  grid rebuilt, pricing rows re-seeded / `saved` cleared) → implement
  `venueId = parentVenueId(this.route)` + constructor `effect` + `load(id)` reset
  audit (R-1) → green. Route-mock sweep for both spec files (R-2).
- [ ] **Commit** — `git commit -m "React to venue param changes in the layout and pricing tabs (#180)"`
- [ ] **Execution status** updated.

## Phase 3 — Tabs: daily-view + requests

Same shape as phase 2. Resets under test: daily `pendingSets`; requests `expired` +
store re-write. Commit:
`git commit -m "React to venue param changes in the daily and requests tabs (#180)"`

## Phase 4 — Tabs: payouts + venue-tab; harness integration spec

Same shape for the two tabs (resets: `statementOpen`; venue-tab form re-seed +
`saved` cleared). Then the AC-5 spec: new `console-venue-switch.spec.ts` with
`provideRouter(routes)` from `app.routes.ts`, `HttpTestingController`, session seam
stubbed (open-questions assumption); navigate `/operator/1/beach-map` →
`/operator/2/beach-map`, assert venue-2 header + venue-2 HTTP loads. Commit:
`git commit -m "React to venue param changes in the payouts and venue tabs, pin via router harness (#180)"`

## Phase 5 — Suite green + ready-for-review

- [ ] `npm run lint` · `npm test` (full, once) · `npm run build` — all green locally.
- [ ] Merge latest `origin/main` if moved; push; verify the PR's CI run.
- [ ] Mark PR ready for review → run the Review gate + Sonar gate per
  `references/pr-gates.md`; findings re-enter at Implement.
- [ ] Close-out: finalize Execution status (`merged via PR #NN`), riviera-docs-freshness
  over the branch range (tab TSDocs, this plan), issue #180 closed by the PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | plan (grill) | constructor-snapshot `:venueId` reads | `grep -rn "parentVenueId\|snapshot.paramMap" frontend/src/app` | shell + 6 tabs (in scope); `venue-map.ts` (tourist) | fix all in-scope; `venue-map` deliberately out (Non-goal — no in-app venue→venue nav on the tourist side either) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** `npm test -- --run operator` → all operator specs green incl. the
  new param-change cases. Verified at commit `<sha>`.
- [ ] **AC-5:** `npm test -- --run console-venue-switch` → green. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** justified N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: `todayBookingDate` usage unchanged (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] Flyway N/A (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract; RV-FE-8 table unchanged.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`).
- [ ] **The review gate ran in full** per `references/pr-gates.md` §1.
