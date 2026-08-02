# Fold venue creation into the operator console (#278) — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator who owns no venue lands on `/operator` and creates their venue there,
inside the Liquid Glass console surface; `frontend/src/app/venue-admin/` is deleted and
`/venue-admin` becomes a one-release redirect — completing the Liquid Glass coverage of
epics #133/#141.

**Architecture:** Frontend-only. The create form becomes a new `operator/` feature component
(`VenueCreateCard`) rendered by `OperatorHome` in two states: the **0-owned-venues zero
state** and the **deliberate create** state (`/operator?create=1`), so "Add another venue"
stays reachable for operators who already own venues. The single most significant decision:
the deliberate-create entry is a **query param on `/operator`, not a new route** — a route
like `/operator/new` would sit in `operator/:venueId`'s parameter space (route-order
hazard), while the query param reuses the existing guard, chrome, and `landingRouteFor`
decision table unchanged except for its one 0-venue line (exactly the seam #277 left).

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — `POST
/api/venues` (creator-owns-on-create, S6 #115) is reused as-is.

**Source of intent:** GitHub issue #278 (+ its 2026-07-22 unblock comment recording the
S9 #277 handoff seams).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the e2e blast radius is 11 files, not the 1 the issue names, and that only three
venue-editor specs exist, not four) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger below, which surfaced the success-state and page-title changes as
*changed*, not *preserved*) · `tdd` (each phase is red-green: component specs before the
component, spec updates before each repoint) · `riviera-review-overlay` (review gate — due
at ready-for-review) · `riviera-docs-freshness` (due at close-out over `main..HEAD` —
parenthesis updated when it runs) · `grilling` (issue interrogation — validated the #277
seams against code) · `riviera-frontend` (placement: `operator/` owns the relocated
service/model; redirect uses the established `parseUrl` shape; picker/console link rules) ·
angular-cli MCP `list_projects` + `get_best_practices` (v22 standards confirmed: Signal
Forms, `@Service`, host-object bindings, inline template for small components, a11y
mandatory) · `riviera-tailwind` (load before phase 1 styling — share-via-directive,
token-first, no `@apply`) · `angular-developer` (load before phase 1 — component technique)
· `playwright-cli` (load before phase 5 — e2e authoring; suite placement per RV-FE-E2E)

**Branch:** `claude/create-venue-liquid-glass-migration-ysor0z` — the session's designated
remote branch, standing in for `feature/create-venue-into-console` per the `riviera-sdlc`
cloud addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in operator owning **no** venue, when they land on
      `/operator`, then the create-venue form renders inline on the porcelain console
      surface (no forward to a second page). *Pinned by:*
      `operator-home.spec.ts` ("renders the create card for an operator with no venues") +
      `unified-auth.e2e.ts` ("an operator with no venue is sent to onboarding", repointed to
      `/operator`).
- [ ] **AC-2:** Given valid venue details, when the operator submits, then the venue is
      created via `POST /api/venues`, the cached owned-venues list is reset **before**
      navigation, and the operator lands in `/operator/:newId/beach-map` (creator-owns-on-
      create re-proven, not re-implemented). *Pinned by:*
      `venue-create-card.spec.ts` ("creates the venue, resets the owned list, navigates to
      the new console's beach-map tab") + mocked e2e `operator-onboarding.e2e.ts`.
- [ ] **AC-3:** Given an operator who already owns venues, when they follow the "Create a
      venue" entry (console header, operator chrome, or the picker's "Add another venue"),
      then `/operator?create=1` renders the create form without forwarding to any owned
      console. *Pinned by:* `operator-home.spec.ts` ("?create=1 renders the create card
      instead of forwarding") + `operator-chrome.spec.ts` / `operator-console.spec.ts`
      (link targets).
- [ ] **AC-4:** Given any visit to `/venue-admin`, when the route resolves, then the app
      redirects to `/operator?create=1`, and no in-app link or navigation targets
      `/venue-admin` (the `/venue-admin/daily/:venueId` → console-tab redirect stays).
      *Pinned by:* `app.routes.spec.ts` ("/venue-admin redirects to the operator home in
      create mode") + `app.spec.ts` route-inventory update + a repo grep at review.
- [ ] **AC-5:** Given the retired editor's behavior ledger (below), when the new form is
      exercised, then every `preserved` row holds: all 8 fields with their defaults, the 6
      `required` validations and their exact messages, numeric parse-on-submit →
      `INVALID_REQUEST`, each `VenueAdminErrorCode` message, `UNAUTHORIZED` →
      `operator.sessionLost()`, and the saving/disabled submit state. *Pinned by:*
      `venue-create-card.spec.ts` (one test per ledger row marked preserved).
- [ ] **AC-6:** Given the new create surface, when axe and the composited-contrast specs
      run, then WCAG AA holds — contrast proven by maths, not eyeballing. *Pinned by:*
      `venue-create-card.a11y.spec.ts` + `venue-create-card.contrast.spec.ts` + the axe
      check in the mocked e2e.
- [ ] **AC-7:** Given the mocked Playwright suite, when an operator signs in with 0 venues
      and creates a venue, then the browser lands in the new venue's console; the
      real-backend suite's create path (`support/operator.ts#createVenue` +
      `venue-editor.e2e.ts`) is repointed to the new flow, not dropped. *Pinned by:*
      `operator-onboarding.e2e.ts` (mocked, CI) + repointed
      `real-backend/venue-editor.e2e.ts` (local-only).
- [ ] **AC-8:** No SCSS files added, no `@apply`; the deleted `venue-editor.scss` is the
      last venue-admin SCSS. *Pinned by:* review-gate check + `git ls-files
      'frontend/src/app/venue-admin/*'` returning empty.

## Non-goals

- Any backend or schema change — `POST /api/venues` and its `hasRole(OPERATOR)` gate are
  already correct.
- Renaming or restructuring the console's tab routes, or adding a "create" console tab.
- Renaming the relocated `VenueAdminService`/model types (the issue says relocate, keep).
- Multi-venue bulk onboarding, venue deletion, or editing after creation (console tabs own
  that since O3/O4/O8).
- Removing the `/venue-admin/daily/:venueId` → `/operator/:venueId/daily` redirect (O6's
  deprecation window is its own).

## Behavior-parity ledger (retirement / replacement slices only)

Old surface: `venue-admin/venue-editor.{ts,html,scss}` at `/venue-admin`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Route guarded by `operatorSessionGuard` (redirect to unified sign-in with `returnUrl`) | preserved | `/operator` already carries the same guard; the redirect chain lands signed-out visitors on the auth card |
| Operator chrome (`data.operatorChrome`): header with sign-out, password change, admin link | preserved | `/operator` already renders `operator-chrome` — the sign-out affordance parity row |
| 8 fields: name, beach, region, description, bookingMode (INSTANT/REQUEST select), commissionBps (text, `inputmode=numeric`), payoutCurrency, bookingCutoff (`type=time`) with defaults `INSTANT`/`1500`/`EUR`/`18:00` | preserved | same Signal Forms model, moved verbatim into `VenueCreateCard` |
| `required` validation on 6 fields with exact messages, shown only when touched | preserved | same schema + touched-gated error rendering |
| `parseWholeNumber(commissionBps)` on submit; parse failure → `INVALID_REQUEST` without an HTTP call | preserved | same submit path |
| Submit disabled while `invalid() || saving()`; label flips to "Creating…" | preserved | same bindings |
| Error mapping `venueAdminErrorOf`: UNAUTHORIZED / NO_SUCH_VENUE / INVALID_REQUEST / UNKNOWN → operator-facing messages in a `role="alert"` | preserved | service + mapper relocated unchanged; same message table |
| `UNAUTHORIZED` additionally calls `operator.sessionLost()` (dead-session recovery, #109) | preserved | same call in the card's failure handler |
| Form hidden entirely when `operator.signedIn()` is false (post-`sessionLost` state) | preserved | same `@if (operator.signedIn())` gate in the card |
| `ownedVenues.reset()` after a successful create (S9 #277 cache invalidation) | preserved | called before navigating — the navigation target *is* the stale-cache consumer |
| Success state: in-page "Venue **#id** created" card with an "Open the console" link | **changed** | issue #278 decision: navigate straight to `/operator/:newId/beach-map` — the operator's next real step is laying out the map |
| Page title `Create a venue — Riviera` | **changed** | the surface lives under `/operator` (`Your venues — Riviera`); a dedicated title would need a dedicated route, rejected above |
| `/venue-admin` as a durable URL | **changed** | one-release redirect to `/operator?create=1` (mirrors #277's `/account/register` window); `?create=1` keeps the bookmark's *create* intent for multi-venue owners |
| Hand-rolled SCSS (`.editor`, `.card`, `.field`, `.btn-primary`) | dropped | the point of the slice — Tailwind v4 + shared glass primitives; `venue-editor.scss` deleted |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The 11-file e2e blast radius: mocked-suite specs entering via `goto('/venue-admin')` start traversing a redirect chain and assert stale URLs (`unified-auth.e2e.ts` asserts `/venue-admin$`) | high | med | Phase 5 sweeps every hit of the intake grep: repoint entry `goto`s to `/operator`, fix URL assertions, keep exactly one spec asserting the redirect itself | session | open |
| R-2 | The real-backend suite is local-only and cannot run in this cloud session — a repoint error ships silently | med | med | All four consumers go through `support/operator.ts#createVenue`; change the id source (console URL instead of the removed success card) in that one helper; flag the residual risk in the PR for a maintainer-local run | session | open |
| R-3 | `OperatorHome` becomes dual-purpose (forward vs render-form) and regresses the S9 landing table (R-12's "network blip sends operator to onboarding") | med | high | The decision table stays in pure `landingRouteFor` (one line changes: `[] → '/operator'`); the failed-load → retry state is untouched and its spec keeps pinning it; every branch (0/1/N venues × create-param × failure) gets a unit spec | session | open |
| R-4 | Contrast regressions on the porcelain form (WCAG 1.4.11 field borders, error text) | low | med | Reuse the already-AA-proven `--riv-field-*`/`--riv-card-*` tokens; composited maths in `venue-create-card.contrast.spec.ts` per the established pattern | session | open |
| R-5 | Dangling references after deleting `venue-admin/` (imports, route inventory, `app.spec.ts` chrome list) | med | low | Phase 4 is delete + full `npm run lint` + full unit run + the intake grep re-run | session | open |
| R-6 | A parallel PR claims the same files | low | low | Grill check found only Dependabot PRs open; no Flyway numbers in scope | session | closed — verified at intake |

## Open questions / Assumptions

- **Assumption:** the real-backend suite cannot be executed in this cloud session (needs a
  live backend + Postgres under Playwright); the repoint is static and a maintainer-local
  run is the verification. — *Owner:* session · *Resolves by:* PR description (flag it) +
  R-2.
- **Assumption:** header links keep the label "Create a venue" (parity); only the picker
  gains the issue's "Add another venue" wording — the issue names the affordance, not the
  copy. — *Owner:* session · *Resolves by:* phase 3.
- **Open question:** does the mocked e2e support's `mockAuthApi` already stub
  `GET /api/venues/mine` (its `venues:` option suggests yes), and what minimum console-tab
  stubs does the post-create navigation need? — *Owner:* session · *Resolves by:* phase 5.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking, availability, or beach-map *data* path
changes; the slice moves a create-venue form between pages. The created venue has no sets
until the operator lays them out in the (unchanged) beach-map tab.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend code, port, or event in scope; `POST /api/venues` is
consumed unchanged.

### Module ownership (§4a)

Frontend feature-folder ownership (the FE mirror of this table): venue creation moves from
the retiring `venue-admin/` feature into `operator/` — the feature that owns the operator's
console surface and already owns every other venue-scoped operator flow (O1–O8). The
relocated `venue-admin.service.ts`/`venue-admin.model.ts` follow "a feature owns its HTTP
service" (`riviera-frontend`). No cross-feature import is added; `VenueCreateCard` imports
only `core/` (auth, owned-venues) and `shared/` (glass primitives, `whole-number`,
`venue-views`).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (`commissionBps` is a pass-through form field the backend
already validates; no money arithmetic on the frontend.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-create-card.ts` (+`.html`) | new | standalone component | signals (`saving`, `errorCode`) | Signal Forms (schema moved from `VenueEditor`) |
| FE-2 | `operator/operator-home.ts` | modify | standalone component | signals; renders `VenueCreateCard` for 0 venues or `?create=1` | — |
| FE-3 | `shared/auth-landing.ts` | modify (1 line) | pure function | — | — |
| FE-4 | `operator/operator-chrome.ts`, `operator/operator-console.html` | modify | link repoints to `/operator?create=1` | — | — |
| FE-5 | `operator/venue-admin.service.ts` + `operator/venue-admin.model.ts` (+ service spec) | moved from `venue-admin/` | `@Service()` HTTP service | — | — |
| FE-6 | `app.routes.ts` | modify | `/venue-admin` → `redirectTo` `parseUrl('/operator?create=1')` | — | — |
| FE-7 | `venue-admin/` folder | **deleted** | — | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`,
Signal Forms, no `ngClass`/`ngStyle`, Tailwind v4 only (no new SCSS), host-pinned porcelain
theme comes from `OperatorHome`'s existing `data-riv-theme` host binding.

## FE↔BE contract

N/A — no contract change. `POST /api/venues` request/response types move files but keep
their shapes; `GET /api/venues/mine` consumed unchanged.

## Execution status

> Session-recovery anchor: re-read this section (plus the current stage's `riviera-sdlc`
> reference) after any compaction or fresh-session pickup, before acting.

**Stage pointer:** implement (phase 5 — e2e sweep)

**Next action:** phase 5 — load `playwright-cli`, author operator-onboarding.e2e.ts,
sweep the /venue-admin entry points.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc committed | ✅ | `aafcc28` |
| 1 — `VenueCreateCard` + relocated service/model (red-green) | ✅ | `05333cb` |
| 2 — `OperatorHome` zero-state + `?create=1` + landing flip | ✅ | `20b6073` |
| 3 — Link repoints (chrome, console, picker) | ✅ | `0f3eca5` |
| 4 — Delete `venue-admin/`, redirect route, inventory updates | ✅ | phase-4 commit (sha recorded next window) |
| 5 — e2e sweep (mocked new+updated; real-backend repoint) | | |
| 6 — Close-out (docs-freshness, final plan state) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding; every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | none yet | |

---

## File structure

- `frontend/src/app/operator/venue-create-card.ts|.html` — the Liquid Glass create form
  (CardGlass + FieldGlass; Signal Forms schema moved from `VenueEditor`)
- `frontend/src/app/operator/venue-create-card.spec.ts|.a11y.spec.ts|.contrast.spec.ts` —
  parity-ledger pins, axe, composited contrast
- `frontend/src/app/operator/venue-admin.service.ts|.model.ts|.service.spec.ts` — relocated
  verbatim (git mv; import paths only)
- `frontend/src/app/operator/operator-home.ts|.spec.ts|.a11y.spec.ts` — zero-state +
  `?create=1` render; picker "Add another venue"
- `frontend/src/app/shared/auth-landing.ts|.spec.ts` — 0 venues → `/operator`
- `frontend/src/app/operator/operator-chrome.ts|.spec.ts`,
  `operator/operator-console.html|.spec.ts` — link repoints
- `frontend/src/app/app.routes.ts`, `app.routes.spec.ts`, `app.spec.ts` — redirect + route
  inventory
- `frontend/src/app/venue-admin/` — deleted (editor + 3 specs + scss; service/model moved)
- `frontend/e2e/operator-onboarding.e2e.ts` — new mocked create→console spec (+axe)
- `frontend/e2e/{unified-auth,operator-sign-in,operator-registration,admin-*}.e2e.ts` —
  entry-point repoints
- `frontend/e2e/real-backend/venue-editor.e2e.ts`, `real-backend/support/operator.ts` —
  repointed create flow (id parsed from console URL)
- `docs/plans/create-venue-into-console.md` — this plan

---

## Phase 1 — VenueCreateCard (red-green)

**Files:** Create `operator/venue-create-card.*` · Move `venue-admin.{service,model}.ts` +
service spec · Test `venue-create-card.spec.ts` first

- [ ] Step 1: Write failing specs — one per `preserved` ledger row + the changed success
      path (create → `reset()` → `navigateByUrl('/operator/31/beach-map')`).
- [ ] Step 2: Run `npm test -- venue-create-card` → FAIL (component absent).
- [ ] Step 3: Implement the card: template from `venue-editor.html` restructured onto
      CardGlass/FieldGlass with Tailwind tokens; logic from `VenueEditor` minus the
      success-card state, plus router navigation. Relocate service/model (git mv).
- [ ] Step 4: Run `npm test -- venue-create-card venue-admin.service` → PASS; a11y +
      contrast specs green.
- [ ] Step 5: Generalization audit — due only if a bug is fixed / pattern introduced.
- [ ] Step 6: Commit (`… (#278)`), Step 7: update Execution status in the same window.

## Phase 2 — OperatorHome integration

- [ ] Failing specs first: 0 venues renders card (no navigation); `?create=1` renders card
      for a 1-venue operator; failure state unchanged; `auth-landing.spec.ts` flips to
      `/operator`.
- [ ] Implement: `landingRouteFor` one-line change; `OperatorHome` reads the create param
      reactively, renders `VenueCreateCard`, keeps retry state.
- [ ] `npm test -- operator-home auth-landing` → PASS. Commit + status update.

## Phase 3 — Link repoints

- [ ] Update `operator-chrome.spec.ts`, `operator-console.spec.ts` expectations →
      `/operator?create=1`; picker spec gains "Add another venue".
- [ ] Implement repoints (chrome `[queryParams]`, console html, picker entry).
- [ ] `npm test -- operator-chrome operator-console operator-home` → PASS. Commit + status.

## Phase 4 — Retirement

- [ ] `app.routes.spec.ts` failing spec: `/venue-admin` lands on `/operator?create=1`.
- [ ] Swap route to `redirectTo` + delete `venue-admin/` (editor, 3 specs, scss); update
      `app.spec.ts` chrome inventory; grep: no non-redirect `/venue-admin` reference
      remains in `src/`.
- [ ] Full `npm run lint` + `npm test` → PASS. Commit + status.

## Phase 5 — e2e sweep

- [ ] Load `playwright-cli` first (routing gate).
- [ ] New `operator-onboarding.e2e.ts` (mocked): 0-venue sign-in → inline form → POST 201 →
      beach-map tab; axe on the form state.
- [ ] Repoint mocked-suite entry points + `unified-auth` URL assertion; keep one
      redirect-assertion spec.
- [ ] Repoint `real-backend/support/operator.ts#createVenue` (id from URL) +
      `venue-editor.e2e.ts` (guard redirect via `/operator`, form on zero state).
- [ ] `npm run test:e2e:a11y` → PASS. Commit + status.

## Phase 6 — Close-out

- [ ] `riviera-docs-freshness` over `main..HEAD`; patch or flag findings.
- [ ] Final plan state in the PR's own last commit, citing `merged via PR #NN`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-6:** `npm test` (full unit run incl. a11y/contrast specs) → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** `npm run test:e2e:a11y` → PASS (real-backend repoint static — R-2). Verified at commit `<sha>`.
- [ ] **AC-8:** `git ls-files 'frontend/src/app/venue-admin/*'` → empty. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] No JPA introduced (invariant #1 — no backend code at all).
- [ ] Availability section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] Modulith section justified N/A; FE import direction clean (invariant #11 mirror).
- [ ] Payment/payout N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6) — cutoff field remains an opaque `HH:mm` string.
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no Flyway migration (invariant #12).
- [ ] Frontend standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] Close-out written in THIS PR, citing `merged via PR #NN`.
- [ ] The review gate ran in full (invocation ladder, `references/pr-gates.md` §1).
