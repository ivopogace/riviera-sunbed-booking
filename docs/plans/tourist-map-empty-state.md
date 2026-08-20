# Tourist Beach Map — Zero-Set Empty State Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist-visible venue whose operator has drawn no layout (0 sets) renders an
explained empty state — a message and a way out — in place of the two orientation banners
around empty space, and its availability summary stops reading "0 of 0 sets free on
&lt;date&gt;".

**Architecture:** One decision, and it is a placement decision, not a new mechanism. The
shared `BeachMapCanvas` already projects a `canvasEmpty` slot in place of the legend, the
grid and the footer whenever `rows()` is empty (`beach-map-canvas.html`); the tourist map
is simply the one surface of four that projects nothing into it, so this slice fills the
existing slot the way `layout-editor.html`'s `layout-empty` already does. **No shared
component changes** — which is what makes "operator beach-map surfaces render unchanged"
(AC-4) structurally true rather than a claim to re-verify. The second half is the
availability summary: its `<p>` stays one stable `aria-live` node and branches its
*content* (never the element — a swapped-in live region announces unreliably), with the
decorative progress bar dropped when there is no ratio to draw.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only slice; no table, no
migration, no SQL. The backend already serves this state correctly: `JdbcVenueCatalog`
reads `set_position` for the venue and returns an empty `sets` list with a `null`
`fromPrice`, which the header's "from €X / set" slot already suppresses.

**Source of intent:** GitHub issue #717 (raised by the #701 review gate as PR #716's
finding F-9). Copy register follows the existing tourist precedent for the same state on
Discover: `pages/home/home.html`'s "No sets yet" price-slot fallback.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the issue's "no bookable spots for **the chosen day**" framing is wrong: `sets` come from
`set_position`, which is date-independent, so no date change can ever populate this map,
and the copy must not imply otherwise; also that "contact the venue" is not an
implementable pointer — the app surfaces no venue contact channel anywhere — leaving
"back to Discover" as the only honest exit. Confirmed no Flyway number and no in-flight
overlap: every open PR is a Dependabot bump) · `riviera-plan-doc` (this template — the
Behavior-parity ledger forced the *existing* zero-set behaviours into the open, which is
how the legend/footer/`fromPrice` suppression turned out to be already-correct and
therefore ACs to **pin**, not code to write) · `tdd` (each phase red first: the empty-state
spec before the `canvasEmpty` block, the summary spec before the branch) ·
`riviera-review-overlay` (review gate — filled at ready-for-review) ·
`riviera-docs-freshness` (filled at merge close-out) · `riviera-frontend` (placement: this
is tourist-map-local markup inside an existing feature file, so nothing is promoted to
`shared/` — no new file, no new cross-feature import; the e2e goes in the **CI-safe mocked
suite** because the change is render + navigation, per RV-FE-E2E) · `riviera-tailwind`
(Tailwind for all new markup — `venue-map.html` carries no `.scss`, so there is no
migrate-on-touch debt; `text-[14.5px]`-style explicit sizes, the reused
`app-retry-button` component rather than a hand-rolled CTA, no `@apply`) ·
`angular-developer` + angular-cli MCP (`get_best_practices`: native `@if` control flow,
`computed()` for derived state, class bindings over `ngClass`, axe/WCAG AA as a MUST) ·
`playwright-cli` (the mocked e2e: `page.route` API stubbing, role/test-id locators,
web-first `expect` with no fixed sleeps) · `riviera-local-debug` (scoped Vitest +
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the cloud Playwright run)

**Branch:** `claude/sdlc-717-k7mfi9` — the cloud session's **designated remote branch
stands in for `feature/tourist-map-empty-state`** (`riviera-sdlc` § Remote/cloud session
addendum); the literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

> **Altitude note.** This slice has no inner hexagon: it is a presentation-only change to
> one Angular surface, and its whole subject *is* what a tourist sees. The ACs are
> therefore written at the surface the issue names, which is the only boundary the change
> has. No backend behaviour is in scope — see *Spring Modulith* below.

- [x] **AC-1:** Given a tourist-visible venue with zero sets, when its beach map loads,
      then the map card renders an explanatory empty-state message between the two
      orientation banners instead of empty space. *Pinned by:*
      `venue-map.spec.ts` › "explains an empty map instead of framing empty space (#717)"
- [x] **AC-2:** Given that same venue, when the map loads, then the empty state offers a
      "Back to Discover" action, and activating it navigates to `/`. *Pinned by:*
      `venue-map.spec.ts` › "offers a way out of an empty map, back to Discover (#717)"
- [x] **AC-3:** Given that same venue, when the map loads, then the availability summary
      reads "No sets to book yet" — no "0 of 0", no date — and the decorative
      availability bar is not rendered. *Pinned by:* `venue-map.spec.ts` › "replaces the
      0-of-0 summary and its empty bar with a plain no-sets line (#717)"
- [x] **AC-4:** Given that same venue, when the map loads, then no legend, no tile grid
      and no "Tap any free set to book it" footer render. *Pinned by:*
      `venue-map.spec.ts` › "renders no legend, grid or tap-hint for a venue with no sets
      (#717)" (canvas-level counterpart already pinned by `beach-map-canvas.spec.ts` ›
      "projects the legend slot above the wash, and drops it with the grid (#701)")
- [x] **AC-5:** Given a venue **with** sets, when its map loads, then the empty state is
      absent and the summary keeps its "N of M sets free on &lt;date&gt;" form with its
      bar. *Pinned by:* `venue-map.spec.ts` › "shows the availability summary '18 of 24'"
      (existing, extended with an empty-state absence assertion)
- [x] **AC-6:** Given a tourist-visible venue with zero sets, when its beach map is
      rendered in a real browser, then axe reports no serious violations and the
      "Back to Discover" control returns the tourist to the discovery list. *Pinned by:*
      `frontend/e2e/discovery-flow.e2e.ts` › "a venue with no published map explains itself
      and points back to Discover (#717)" — the CI-run mocked suite (RV-FE-E2E: render +
      navigation, not wiring)
- [x] **AC-7:** Given the zero-set map component tree, when axe audits it under jsdom,
      then it reports no violations. *Pinned by:* `venue-map.a11y.spec.ts` › "has no
      violations on a venue with no sets (#717)"

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **The date picker and cutoff explainer stay exactly as they are** on a zero-set venue.
  They are venue-header chrome, not map chrome; hiding them would be a second behaviour
  change the issue does not ask for, and re-fetching on a date change stays harmless.
- **No change to the operator surfaces** (`layout-editor`, `daily-view-tab`,
  `set-editor`) or to `shared/beach-map-canvas.ts` / `shared/beach-grid-frame.ts`.
  AC-4's "unchanged" is held by not touching them at all.
- **No change to Discover.** The zero-set venue's card there already reads "No sets yet"
  with a 0 % bar; whether a mapless venue should be listed at all is a `venue`/`operator`
  visibility question (#693's territory), not this slice's.
- **No backend change.** The empty `sets` payload is already correct.
- **No new shared component or directive.** One empty state on one surface is not a
  second consumer; promoting it would be speculative (`riviera-frontend`).

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

The slice replaces one *state* of an existing surface (the zero-set beach map), so the
ledger is filled for that state's current behaviours.

| Old-surface behavior (zero-set tourist map, today) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Map card renders the sea + promenade banners around empty space | **changed** | the `canvasEmpty` slot now fills the gap; the banners themselves are untouched (`beach-grid-frame.ts`) |
| Legend not rendered | **preserved** | still inside `beach-map-canvas.html`'s `@if (rows().length > 0)`; AC-4 pins it from the tourist surface too |
| `canvasFooter` "Tap any free set to book it" not rendered | **preserved** | same `@if` branch — nothing to tap, so nothing promised |
| Availability summary reads "0 of 0 sets free on &lt;date&gt;" | **changed** | branches to "No sets to book yet" inside the same `aria-live` node (AC-3) |
| Availability bar renders at 0 % width (`totalCount() ? … : 0`) | **dropped** | a ratio with no denominator draws nothing; the `@if` removes the track rather than painting an empty one. The `totalCount() ?` guard stays as the div's own division guard is now unreachable-but-harmless — removed with the div |
| Header "from €X / set" suppressed (`fromPrice` is `null`) | **preserved** | untouched — `venueView().priceLabel` already resolves `null` |
| Header "New" pill / rating, description, amenity chips, photo band | **preserved** | untouched; none depend on set count |
| Date picker + cutoff explainer render and re-fetch on change | **preserved** | untouched (Non-goals) |
| 404 → not-available panel; error → retry panel; loading → "Loading the beach map…" | **preserved** | untouched; all three are `@else if` siblings of the loaded branch, unrelated to set count |
| Back pill "← All beaches" at page top | **preserved** | untouched; the new in-card "Back to Discover" is an *addition* at the dead end, not a replacement |

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.
> Categories that already matter in this project: concurrent reservation of the
> same set (invariant #2), Stripe webhook duplicate/out-of-order delivery (#8),
> payout double-accrual (#9), timezone/cutoff arithmetic (#4/#6), money rounding
> (#5), module boundary leaks (#11), per-venue authorization on any venue-scoped
> endpoint (an operator must only reach their own venue's data — BOLA; if the slice
> touches `/api/venues/{venueId}/**`, the payout ledger, staff bookings, or
> beach-map edit, state how ownership is verified in the application service), and
> any temptation toward JPA or Stripe Connect. A new/changed request DTO or error
> response → note the error-contract expectation (`riviera-java-conventions` §6b). A
> Flyway migration → claim `V<n>` only per the in-flight check in `riviera-sdlc`
> `references/issue-intake-gate.md` (free on `main` AND unclaimed by open PRs; name
> who renumbers).

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Copy implies a **different date** would show sets, sending the tourist back to the picker forever — the map is date-independent (`set_position`), so no date works | high (the issue text itself says "for the chosen day") | med | copy states the layout is unpublished and says "on any date"; AC-1's spec asserts the sentence, not just the element | Claude | closed — `dde5a53` |
| R-2 | Swapping the `aria-live` **element** (rather than its text) between the count and the no-sets line silently kills the date-change announcement for the populated case | med | med | the `<p data-testid="availability" aria-live="polite">` node is unconditional; only its inner content branches. AC-5 keeps the populated path pinned | Claude | closed — `dde5a53` |
| R-3 | An added heading in the empty state breaks the page's heading order (h1 → h?) or duplicates a landmark name, failing axe | low | med | the empty state's title is an `<h2>` under the page's single `<h1>` (venue name); AC-6/AC-7 run axe over exactly this state in both jsdom and a real browser | Claude | closed (jsdom) — `dde5a53`; browser leg with AC-6 |
| R-4 | New empty-state ink fails WCAG AA on the map-card glass | low | med | reuses the two token pairs `venue-map.contrast.spec.ts` already proves on that surface (`--riv-card-ink`, `--riv-card-ink-soft`) plus the CTA-gradient/white pair proven for the retry button — no new colour is introduced; the spec's test names are updated to name this surface too | Claude | closed — `dde5a53` |
| R-5 | Touching the map template regresses a populated map (the common case) | low | high | the empty state lives entirely inside the `canvasEmpty` slot, which the canvas renders **only** in the `@else` of `rows().length > 0`; the full existing `venue-map` + `beach-map-canvas` spec files run per phase | Claude | closed — `dde5a53` (219 specs green across `venue/`, `shared/beach-map-canvas`, all three operator surfaces) |
| R-6 | The plan's File-structure section drifts from the diff (CI-enforced since #533) | med | low | `node scripts/check-plan-file-structure.mjs --diff origin/main` run before every push, with the plan doc staged | Claude | open |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Assumption:** "Point somewhere useful" is satisfied by a **Back to Discover** action
  and nothing else — the app has no venue contact surface (grep over
  `frontend/src/app/**/*.html` finds "phone"/"contact" only in the privacy policy), so
  the issue's alternative suggestion is not implementable today. — *Owner:* Claude ·
  *Resolves by:* phase 0 (stated here; raise at the review gate if the maintainer wants a
  contact channel instead, which would be its own slice)
- **Assumption:** a zero-set venue reaching a tourist at all is **accepted behaviour**,
  not a bug to fix here. #693 made visibility depend on the owning operator being
  `ACTIVE`, which does not require a drawn layout, and #717 asks to explain the state
  rather than to prevent it. — *Owner:* Claude · *Resolves by:* phase 0

### Resolved

- **Assumption (both of the above) — held, phase 0 (`dde5a53`).** The empty state ships
  with "Back to Discover" as its only pointer and does not touch visibility. The
  generalization audit additionally surfaced two operator surfaces with the same
  unexplained-empty-map defect; deferred to **#718** rather than widened into this slice,
  because AC-4 requires them to render unchanged.

## Availability & concurrency (invariant #2)

> **Mandatory if the feature touches `booking`, `availability`, or the beach map.**
> Otherwise write `N/A — does not affect availability` and say why. This is the
> highest-stakes section in the plan.

The slice touches the beach map, so this section is filled rather than waived — but it
adds **no write path**, and that is the substantive statement.

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** The
  slice renders a message on a read-only tourist surface; the only state it reads is
  `VenueMapView.sets`, which is empty by definition in the case at hand — there is no set
  to hold, book or release.
- **Uniqueness guarantee:** unchanged (`availability`'s DB unique constraint on
  `(set_id, booking_date)`).
- **Concurrency strategy:** unchanged — no reservation path is reached; the empty state
  renders no bookable tile and mounts no booking dialog.
- **Pool rule (invariant #3):** unchanged. The `bookable = FREE && ONLINE` predicate in
  `VenueMap.toTile` is untouched and unreachable with zero sets.
- **Cutoff rule (invariant #4):** unchanged — the date picker's `min` (tomorrow,
  `Europe/Tirane`) and the display-only cutoff explainer stay exactly as they are
  (Non-goals); the server remains authoritative.
- **Pinning test:** existing `ConcurrentReservationIT` is untouched and remains the
  proof; this slice adds no case to it because it adds no claim path.

## Spring Modulith — modules, interfaces, events

> **Mandatory if any backend code is in scope. Frontend-only: `N/A — frontend-only`.**

`N/A — frontend-only.` No Java file is in the diff; no module, `api/` port, `spi/` port,
event, or package moves. The backend contract the surface consumes (`GET /api/venues/{id}`
returning `sets: []` and `fromPrice: null`) already exists and is unchanged.

### Module ownership (§4a)

`N/A — frontend-only`; the slice adds no backend capability. Frontend placement is
`riviera-frontend`'s call and is recorded in *Skills consulted*: tourist-map-local markup
stays in `venue/venue-map.html`, nothing is promoted to `shared/` or `core/`, and no new
cross-feature import is introduced (RV-FE-8's frozen set of five is untouched).

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is rendered by the new markup: the empty state has
no price, and the header's `fromPrice` suppression is pre-existing and untouched.

## Angular — frontend surfaces touched

> **Mandatory if frontend is in scope. Backend-only: `N/A — backend-only`.** Load
> `angular-developer`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` — the `canvasEmpty` block projected into `<app-beach-map-canvas>` | existing file, new markup | template of a standalone component | reads `totalCount()` (existing `computed`) and `venueView()`; no new signal | none |
| FE-2 | `venue/venue-map.html` — the availability summary's content branch + the bar's `@if` | existing | template | same `totalCount()` `computed` | none |
| FE-3 | `venue/venue-map.ts` — `RetryButton` is already imported for the failure panels; `onBack()` already exists | existing, unchanged API | standalone component class | — | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`
signal APIs, `NgOptimizedImage` for new images. Document any deviation. (Full
detail in the in-repo `angular-developer` skill's `references/`.)

*Deviations:* none. No new component class is added, so no new `input()`/`output()`
surface; no image; native `@if` control flow; derived state via the existing
`computed()` (`totalCount`). `app-retry-button` is reused for the exit action — it is the
same control the not-available panel already uses for "Back to Discover", and it carries
`[appTouchTarget]`, so the 44 px floor is declared without a per-control edit.

## FE↔BE contract

`N/A — no contract change.` `VenueMapView.sets` being empty and `fromPrice` being `null`
are the API's existing, documented shape (`shared/venue-views.ts`;
`JdbcVenueCatalog.findMap`). The frontend types are unchanged and remain hand-written and
strict — no `as any`.

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. After a compaction, in a fresh
> session, or whenever unsure: re-read it (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it
> records — the same commit or the immediately-following one, nothing unrelated between;
> covers every plan-doc update incl. *Skills consulted* — at every phase boundary and
> SDLC stage transition (why: `riviera-sdlc` §Context hygiene).
>
> **Finalize BEFORE the merge, in the PR's own last commit** — stage pointer DONE, phase
> rows ✅ with commits, Open Questions empty, risk rows closed, AC pin-names matching the
> shipped tests. Record **`merged via PR #NN`, never a merge SHA**.

**Stage pointer:** `review gate — fixing findings` on PR **#719** (ready for review; all 8
check runs green; Sonar gate verified green **with an empty reported list**).

**Next action:** Land the review-gate fixes, then re-verify CI + Sonar and finalize this
section for the merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Empty state + summary branch (unit + a11y) | ✅ | `dde5a53` |
| 1 — Mocked Playwright e2e | ✅ | `fd4285f` |
| 2 — Close-out (docs freshness, execution status) | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (CLAUDE.md-adherence agent) | The new `mapless()` TSDoc — and the sentence added to `venue-map.contrast.spec.ts`'s header block — carried issue numbers (`#717`, `#693`), which `riviera-java-conventions` §6d forbids in a doc comment ("provenance is `git blame`'s job"; `frontend/.claude/CLAUDE.md` cites it as canonical). Real: the guard cannot catch it, because `check-inline-comments.mjs` exempts `/** */` blocks by design. The adjacent pre-existing `miramar()` fixture has the same shape but is **untouched by this diff**, and RV-STYLE-1 scopes to what the diff writes | fixed-in-`290de42` |
| — | sonar | Gate green **and list pulled**: 0 issues, 0 code smells, 0 duplicated blocks. Analysis confirmed real (`new_lines = 30`, `ncloc = 256`) rather than the false-clean-on-unanalyzed zero. `new_coverage` was **not among the gate's 5 conditions** — no new coverable lines exist (an Angular template plus spec/e2e files), so the ≥80% bar has nothing to apply to; it is not being waived | no action |
| — | CI | All 8 check runs green on `50db1f6` (backend, frontend incl. the 226-test mocked e2e suite, repo hygiene, CodeQL ×2 + app, SonarCloud ×2) | no action |

---

## File structure

> Map files to be created/modified before defining tasks. Every path in the diff,
> including the one-line ones — machine-checked by `scripts/check-plan-file-structure.mjs`
> since #533. Run it (with this doc staged) before every push.

- `docs/plans/tourist-map-empty-state.md` — this plan doc.
- `frontend/src/app/venue/venue-map.html` — the `canvasEmpty` empty state; the
  availability summary's content branch and the bar's `@if`.
- `frontend/src/app/venue/venue-map.spec.ts` — the zero-set fixture and AC-1..AC-5 cases.
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — AC-7, axe over the zero-set map.
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — test-name/header refresh so the
  proven token pairs name the empty state too (no new arithmetic).
- `frontend/e2e/discovery-flow.e2e.ts` — AC-6, added beside its sibling rather than in a
  new file: the `#693` "hidden venue → way back, not a retry loop" test is the same shape
  (a venue-map dead end that must offer an exit), and this file already mocks the
  discovery list the "Back to Discover" leg has to land on. A new spec file would have
  duplicated that mock to assert less.

---

## Phase 0 — Empty state + summary branch (unit + a11y)

**Files:** Modify `frontend/src/app/venue/venue-map.html` · Test
`frontend/src/app/venue/venue-map.spec.ts`, `frontend/src/app/venue/venue-map.a11y.spec.ts`,
`frontend/src/app/venue/venue-map.contrast.spec.ts`

- [x] **Step 1: Write the failing tests** — a `mapless()` fixture (a real venue payload
      with `sets: []`, `fromPrice: null`) plus the AC-1..AC-4 cases in `venue-map.spec.ts`,
      the AC-5 absence assertion on the existing "18 of 24" case, and the AC-7 axe case in
      `venue-map.a11y.spec.ts`.
- [x] **Step 2: Run them, verify they fail** —
      `npx vitest run src/app/venue/venue-map.spec.ts src/app/venue/venue-map.a11y.spec.ts`
      → FAIL (`map-empty` not found; summary still reads "0 of 0").
- [x] **Step 3: Minimal implementation** — the `canvasEmpty` block in `venue-map.html`
      (`<h2>` + explanatory `<p>` + `<app-retry-button label="Back to Discover">`), and the
      availability `<p>`'s content branch with the bar behind `@if (totalCount())`.
- [x] **Step 4: Run them, verify they pass** — the same command → PASS; then the
      surface's full spec set (`venue-map*.spec.ts` + `shared/beach-map-canvas.spec.ts`)
      as the end-of-phase regression.
- [x] **Step 5: Generalization-audit pass** — population: *every surface that projects a
      tile grid into `BeachMapCanvas`* (the mechanism, not "surfaces that look empty");
      enumerate with `grep -rl "app-beach-map-canvas" frontend/src/app`, judge each for a
      missing `canvasEmpty`. Append to the log below.
- [x] **Step 6: Commit** — `dde5a53`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Mocked Playwright e2e

**Files:** Modify `frontend/e2e/discovery-flow.e2e.ts`

- [x] **Step 1: Write the test** — a zero-set venue served at `/api/venues/8` via
      `page.route`; assert the empty state and its heading, that the copy says "on any
      date", that no `set-tile` / Legend list / `map-pan` viewport / `availability-bar`
      is present, that the summary reads the no-sets line, that
      `expectNoSeriousAxeViolations` is clean, and that "Back to Discover" lands on the
      discovery list.
- [x] **Step 2: Run it** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts discovery-flow --grep "#717"`
      → 1 passed. (It is a presence assertion on markup phase 0 introduced, so it cannot
      pass vacuously; phase 0's unit specs were verified red before that markup existed.)
- [x] **Step 3: Implementation** — none needed beyond phase 0; the spec is the
      deliverable.
- [x] **Step 4: Run the regression** — the whole `discovery-flow` file (8 passed), then
      the **entire** mocked suite (`226 passed`, 6.1 min), plus `npm run lint` +
      `npm run format:check` clean.
- [x] **Step 5: Generalization-audit pass** — see the log below; it corrected its own
      first enumeration, which was the interesting part.
- [x] **Step 6: Commit** — `fd4285f`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Close-out

- [ ] **Step 1:** `riviera-docs-freshness` over `origin/main...HEAD`; patch or record.
- [ ] **Step 2:** `node scripts/check-plan-file-structure.mjs --diff origin/main`,
      `node scripts/check-inline-comments.mjs --diff origin/main` — both clean.
- [ ] **Step 3:** Finalize this Execution status (stage DONE, phase rows ✅ with commits,
      Open Questions resolved, risk rows closed, `merged via PR #NN`) in the PR's own last
      commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | phase 1 (`fd4285f`) | **Mechanism:** every mocked e2e that stubs the tourist venue-map read, so it renders the surface this slice changed. **The first enumeration was wrong and that is the point:** `grep -rln "api/venues" e2e/*.e2e.ts` returned 6 files and silently missed the ones that write the route as an escaped regex (`/\/api\/venues\/1(\?.*)?$/`) — including `venue-map-pan.e2e.ts` and `discovery-flow.e2e.ts`, the two most affected. Re-enumerated escaping-tolerant | `grep -rln 'api.\{0,2\}/venues' e2e/*.e2e.ts` (22 files), cross-cut with `grep -rn "sets: \[\]"` and `grep -rn "goto('/venues/"` | 22 stub the read; 5 serve a `sets: []` venue; of those, **`operator-venue.e2e.ts:208` also visits the tourist `/venues/1`** — so it renders the new empty state | **No change needed, verified not assumed.** That spec asserts only the edited venue name is visible, which the empty state does not disturb. Confirmed by running the **whole** mocked suite: 226 passed |
| 2026-08-20 | phase 0 (`dde5a53`) | **Mechanism:** every surface that projects a tile grid into `BeachMapCanvas` and therefore inherits its `canvasEmpty` slot — not "surfaces that look empty", which would have returned only the one in front of me | `grep -rl "app-beach-map-canvas" frontend/src/app --include=*.html` then `grep -rl "canvasEmpty" …` | 4 surfaces project a grid; only 2 project a `canvasEmpty` (`layout-editor`, and now `venue-map`) | **Subset + follow-up.** `operator/daily-view-tab.html` and `operator/set-editor.html` carry the identical defect and are reachable for every venue before its layout exists — but AC-4 of #717 requires operator beach-map surfaces to render **unchanged**, so fixing them here would contradict the slice. Filed as **#718** with the enumeration and the copy register they need |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1..AC-5, AC-7:** Run `npx vitest run src/app/venue` → all pass. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-map-empty` → pass. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no Java in the diff.
- [ ] **Availability** section filled; no write path added (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled (`N/A — frontend-only`); no cross-module imports (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched; the empty-state copy carries no date.
- [ ] Booking codes unguessable (invariant #7) — untouched.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
