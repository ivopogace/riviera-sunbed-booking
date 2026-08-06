# A9 — Admin console stat strip Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform-admin console the four account/venue stat tiles A1/A2 never
got — Pending approvals, Active operators, Suspended, and Venues (with a commission
sub-caption) — on the console home, from the three ADMIN reads that already exist, adding
no endpoint.

**Architecture:** The single most significant decision is **where the strip renders**: on
the console **home only** (`/admin`), **below** the tab strip, not on all seven tabs above
it as the canvas draws it. Both deviations follow from one fact — Q1 (PR #524) deliberately
declined a layout component, and its revisit trigger (a ninth tab) has not fired — so a
per-tab strip would mean seven copies each re-reading three endpoints per navigation, and
an above-tabs strip on one page only would make the tab pills jump vertically on every
navigation away from home. The tile presentation is extracted to `shared/stat-tile.ts` so
`admin/` reuses it **without** importing `operator/` (RV-FE-8).

**Persistence:** N/A — frontend-only; no table, no migration, no backend change (invariant
#1 untouched).

**Source of intent:** epic [#348](https://github.com/ivopogace/riviera-sunbed-booking/issues/348)
— slice **A9** ("Console stat strip — the account tiles A1/A2 never got"), plus its A9 note
and the A8 scope note's four hand-off notes. Visual spec:
`docs/design/riviera-admin-console.dc.html` (~line 250, the `riv-stats` grid).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the epic's fold numbers predate A8/A3 and had to be re-measured, and that A9's structural
choice must be argued against Q1 rather than around it) · `riviera-plan-doc` (this
template — forced the Behavior-parity ledger, which is what surfaced that refactoring the
operator strip onto a shared tile is a *replacement* needing a row-by-row check) · `tdd`
(each phase writes the failing spec first — the strip's dash-vs-zero cases before the
component, the fold guard before the markup) · `riviera-review-overlay` (review gate — run
at ready-for-review; RV-FE-8 is the live constraint on this slice) ·
`riviera-docs-freshness` (**ran** over `a02c199..HEAD` at close-out — counting sweep for
"operator-only" / tile-count statements; findings in the Execution status) ·
`riviera-frontend` (structure — placed the tile primitive in `shared/` and the data-bearing
strip in `admin/`, and ruled out the `admin/`→`operator/` import) · `riviera-tailwind`
(styling — directive-shared surface via `appCardGlass` rather than `@apply`, `text-[11px]`
over `text-xs`, no radius on the surface directive) · `angular-developer` + angular-cli MCP
(v22 APIs — `input()` signals, content projection, and the `hostDirectives` composition that
lets the tile own its glass surface) · `playwright-cli` (e2e — the 360px fold guard and the
"strip is home-only" assertion, authored against the mocked CI suite).

**Branch:** `claude/admin-console-stat-strip-a9-lwvop9` — the cloud session's **designated
remote branch stands in for `feature/a9-admin-console-stat-strip`** (`riviera-sdlc` remote
addendum). It exists and already contains `origin/main` (`a02c199`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in admin whose approval queue holds 2 rows and whose account
  list holds 3 active + 1 suspended, when the console home settles, then the strip reads
  `2`, `3`, `1`. *Pinned by:* `AdminConsoleStats.spec.ts › renders the operator counts it is given`
- [ ] **AC-2:** Given the venue read answers two venues at 1500 and 1000 bps, when the strip
  settles, then the Venues tile reads `2` with the sub-caption `mean rate 12.5%`.
  *Pinned by:* `AdminConsoleStats.spec.ts › counts venues and renders the mean rate`
- [ ] **AC-3:** Given the venue read rejects, when the strip settles, then the Venues tile
  reads `—` with **no** sub-caption while the three operator tiles still read their counts.
  *Pinned by:* `AdminConsoleStats.spec.ts › a failed venue read dashes only its own tile`
- [ ] **AC-4:** Given the operator lists have not loaded (or their load failed), when the
  strip renders, then all three operator tiles read `—` and never `0`.
  *Pinned by:* `AdminConsoleStats.spec.ts › unknown counts render a dash, never a zero`
- [ ] **AC-5:** Given the venue read answers an empty list, when the strip settles, then the
  Venues tile reads `0` with no sub-caption (no mean over zero venues).
  *Pinned by:* `AdminConsoleStats.spec.ts › no venues means a real zero and no mean`
- [ ] **AC-6:** Given rates 1500, 1000 and 1000 bps, when the mean is rendered, then it is
  `11.67%` — rounded to whole basis points and formatted by `formatCommissionPercent`, never
  a second percent formatter. *Pinned by:* `AdminConsoleStats.spec.ts › rounds the mean to whole basis points`
- [ ] **AC-7:** Given the strip is rendered, when its subtree is queried for interactive
  elements, then there are none — the strip navigates nowhere, so no focus can be stranded.
  *Pinned by:* `AdminConsoleStats.spec.ts › is inert — no link, button or focusable tile`
- [ ] **AC-8:** Given the admin console home at 360×740, when it renders with the strip, then
  the first content heading (`Awaiting approval`) is still above the 740px fold and the page
  never scrolls sideways. *Pinned by:* `admin-console-stats.e2e.ts › the console home's first content heading survives the strip at 360px`
- [ ] **AC-9:** Given an admin on `/admin/commissions`, when the page renders, then no stat
  strip is present — the strip is the console **home's**, not the shell's.
  *Pinned by:* `admin-console-stats.e2e.ts › the strip is the console home's, not every tab's`
- [ ] **AC-10:** Given the console home rendered with the strip, when axe runs (jsdom
  structural + real-render serious), then there are no violations, in both the loaded and the
  all-dashes states. *Pinned by:* `admin-operators.a11y.spec.ts` + `admin-console-stats.e2e.ts`
- [ ] **AC-11:** Given the operator console's own stats strip after it is refactored onto the
  shared tile, when its existing specs and e2e run, then every assertion passes unchanged —
  the four `oc-stat-*` test ids and their rendered text are byte-identical.
  *Pinned by:* `console-stats-strip.spec.ts` (unchanged) + `operator-console.e2e.ts` (unchanged)

## Non-goals

- **A strip on the other six tabs.** Deferred with its own trigger — see the Open-questions
  *Resolved* entry; it becomes cheap the day a layout component lands, which Q1 already ties
  to a ninth tab.
- **The two payout tiles the canvas draws** ("Releasing tomorrow", "Transfers to fix") — they
  are A6's, blocked on A5/#284.
- **Any new endpoint, DTO or backend change.** All three reads ship today.
- **A booking-weighted effective take rate.** Nothing on the wire supports it; see the
  Risk register R-1 for what is rendered instead and why.
- **Making a tile a link to its tab.** Considered and dropped — the tabs sit directly above,
  and a navigating tile adds exactly the focus-management surface the A8 review fan-out found
  three defects in.
- **Restyling the operator strip.** It is refactored onto the shared tile with pixel-identical
  output; any visual change there is a regression, not a feature.

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces the operator strip's inline tile markup with `shared/stat-tile.ts`. The
admin strip is new and replaces nothing.

| Old-surface behavior (`operator/console-stats-strip.html`) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Four `appCardGlass` articles in a `grid-cols-2 sm:grid-cols-4` wrapper | preserved | the wrapper stays in `console-stats-strip.html`; each article becomes `<article appStatTile>` |
| `appCardGlass` surface on every tile | preserved | `StatTile` composes `CardGlass` via `hostDirectives`, so the identical host classes land on the same `<article>` |
| Tile radius `rounded-[16px]`, padding `px-3.5 py-3`, shadow `0_1px_2px_rgba(7,42,58,0.06)` | preserved | moved verbatim onto the `StatTile` host `class` (radius stays off `CardGlass` — `riviera-tailwind` rule 3) |
| Uppercase 11px label in `--riv-card-ink-faint` | preserved | `StatTile`'s `label` input renders the same span with the same classes |
| 27px bold value in `--riv-card-ink` carrying the tile's `data-testid` | preserved | `StatTile`'s `valueTestId` input puts the id on the same div; the value itself is content-projected, so the free tile keeps its `{{ free }}<span>/ {{ total }}</span>` composite |
| Takings sub-caption `data-testid="oc-stat-net"`, rendered only when takings loaded | preserved | `StatTile`'s optional `sub`/`subTestId` inputs render the same span; the `@if (takings())` guard moves into the binding (`sub` is `undefined` until loaded) |
| `oc-stat`, `oc-stat-label`, `oc-stat-value`, `oc-stat-sub` marker classes | changed → `riv-stat*` | no spec or stylesheet queries them (verified by grep across `src/` and `e2e/`); a shared primitive must not carry an `oc-` (operator-console) prefix. The `data-testid`s — which specs *do* query — are untouched |
| Section landmark `aria-label="Today at your venue"`, `data-testid="oc-stats"` | preserved | untouched; the refactor is inside the grid only |
| Best-effort per-tile reads, `undefined` → `—`, distinct from `0` | preserved | untouched TypeScript; only the template changes |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An unweighted mean of venue rates is read as the platform's effective take rate — it is not, and no wire field supports the weighted figure | **high** | med | The number is kept because it is a genuine *configuration* readout (spot an outlier rate; the Commissions tab is one click away), but the caption names the aggregation — `mean rate 12.5%` — and a footnote states the trap outright: an equal average of venue rates, not the platform's blended take. Pinned by AC-2/AC-6 and asserted verbatim in the e2e | A9 | open |
| R-2 | `admin/` importing `operator/console-stats-strip.ts` would add a sixth cross-feature edge — RV-FE-8 Major, and the grandfathered ledger is tolerated debt, not precedent | med | high | Presentation extracted to `shared/stat-tile.ts` (a pure, stateless presentational primitive — `riviera-frontend`'s `shared/` row); `admin/` imports `shared/`, never `operator/`. The ledger table stays at five edges | A9 | open |
| R-3 | The strip pushes the console home's content past the 740px fold at 360px | med | med | Measured before building (chrome 165px, tabs 3 rows ending y=398, first heading y=430); 2-up tile grid, not three stacked full-width tiles. AC-8 asserts the heading stays above the fold in CI, so a later tile or a longer label fails the build rather than quietly eating the page — the Q1 guard's shape | A9 | open |
| R-4 | A blip in a read renders as a confident `0` (an empty approval queue and a failed read look identical) | med | high | `undefined` is kept distinct from `0` end-to-end: the page exposes counts only once a read has actually succeeded, the strip's venue signal starts `undefined`, and both render `—`. AC-3/AC-4/AC-5 pin all three states | A9 | open |
| R-5 | Refactoring the shipped operator strip onto the shared tile silently changes its render | med | med | Behavior-parity ledger above, row by row; its unchanged unit spec, contrast spec and two e2e specs are the guard (AC-11). No spec is edited to accommodate the refactor — if one needs editing, the refactor is wrong | A9 | open |
| R-6 | `AdminOperators`' existing specs break because the strip injects a service they do not provide | high | low | Expected and cheap: `admin-operators.spec.ts` and `admin-operators.a11y.spec.ts` gain an `AdminCommissionsService` stub. Noted here so it reads as a planned edit, not collateral | A9 | open |

## Open questions / Assumptions

- **Assumption:** the mocked e2e suite's unrouted `GET /api/admin/venues` on specs that visit
  `/admin` without a venue mock (`admin-console-tabs.e2e.ts`, `admin-operator-suspension.e2e.ts`)
  resolves to the dev server's SPA fallback and is caught, dashing only the Venues tile — no
  spec asserts on console errors. *Owner:* A9 · *Resolves by:* phase 3 (run both suites).

### Resolved

- **Open question (the structural decision the epic demanded): does the strip render on the
  console home only, or on every admin page?** → **Console home only, below the tab strip.**
  Reasoning, stated against Q1 rather than around it:
  - Q1's answer was *"one flat wrapping strip, designed for eight — no grouping, no overflow,
    **no layout component**"*, with the revisit trigger recorded in `AdminConsoleTabs`' TSDoc
    as a **ninth tab**. Seven ship today, so the trigger has not fired. Option (b) would need
    either that layout component — reopening a closed decision on grounds Q1 did not weigh —
    or the same strip pasted into seven components, each re-reading three endpoints on every
    tab navigation unless a cache with its own staleness semantics is introduced. Neither is
    A9-sized, and neither is what A9 is for.
  - The canvas renders the stats above the tabs on every screen because it is **one demo
    page** — the same reason `AdminConsoleTabs` already documents for modelling tabs as routes
    rather than as a `tab` state field. Its layout is not evidence for a shell-wide strip here.
  - **Below** the tabs, not above: with the strip on one page only, an above-tabs strip would
    shift the pills down ~210px on `/admin` and back up on every other tab, so the control you
    just clicked moves under the pointer. Below the tabs, the pills sit at a constant `y` across
    all seven tabs and the strip reads as what it is — the home page's summary.
  - **Revisit trigger for option (b):** the day a layout component lands (Q1's ninth tab), the
    strip moves into it and becomes shell-wide for free. Recorded in the component's TSDoc, in
    the same place and shape as Q1's own trigger.
- **Open question: shared tile, or admin's own?** → **`shared/stat-tile.ts`.** `riviera-frontend`
  puts "pure, stateless presentational primitives" in `shared/` and says to promote when two
  features need the same thing — which is now literally true. Building admin's own would ship a
  fourth near-identical tile block against a Sonar merge bar of **0 duplicated blocks**, and
  would leave RV-FE-8's real lesson (the presentation was never operator-specific) unlearned.
- **Open question: keep or drop the "avg commission" sub-caption?** → **Keep, relabelled.** See
  R-1. Dropping it loses a real signal; the mis-read is closed by naming the aggregation in the
  caption and stating the limit in a footnote, which is cheaper than the number's absence.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice renders three ADMIN read-only endpoints and
writes nothing; no `availability(set_id, booking_date)` row, no booking, no beach map.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` changes; no module, port, or event is touched.

### Module ownership (§4a)

N/A — frontend-only; no backend behavior is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope, and **no money arithmetic**. The one computation is the mean of
`commissionBps` values — a **rate**, not an amount — so invariant #5 (integer minor units,
never floating point) is not engaged. It is nonetheless kept exact-integer in spirit: the mean
is rounded to **whole basis points**, the storage grain, and rendered through the existing
`shared/commission-rate.ts` `formatCommissionPercent`, never a second percent formatter. No
ledger, no payout, no commission *money* is computed anywhere on the client (A7's server-side
`commissionBpsOn` remains the only authority for what a booking actually accrues).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/stat-tile.ts` | new | standalone component, `article[appStatTile]`, `hostDirectives: [CardGlass]` | `input()` signals only — no state | none |
| FE-2 | `admin/admin-console-stats.ts` | new | standalone component | three `input<number \| undefined>()` for the operator counts + one own `signal` for the venue read; `computed()` for the mean | none |
| FE-3 | `admin/admin-operators.ts` | existing | standalone component | three new `computed()` count projections + a `countsKnown` signal | none |
| FE-4 | `operator/console-stats-strip.html` | existing | template only | unchanged TypeScript | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs, no
`NgOptimizedImage` (no images). Deviation to document: `hostDirectives` is used for the first
time in this repo — it is the standard Angular composition primitive for exactly this
(a component that *is* a `CardGlass` surface), and the alternative is asking every one of the
eight tiles to repeat `appCardGlass` beside `appStatTile`.

## FE↔BE contract

N/A — no contract change. Three existing ADMIN reads are consumed with their existing types:
`GET /api/admin/operators` → `PendingOperatorView[]`, `GET /api/admin/operators/accounts` →
`OperatorAccountView[]`, `GET /api/admin/venues` → `{ venues: VenueCommissionView[] }`. The
last is reached through the existing `AdminCommissionsService.venues()` rather than a second
client for the same endpoint; its TSDoc gains its second consumer.

## Execution status

**Stage pointer:** `plan` — complete, entering implement (phase 0)

**Next action:** Phase 0 — write `shared/stat-tile.spec.ts` red, then build `StatTile`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `shared/stat-tile.ts` + refactor the operator strip onto it | | |
| 1 — `admin/admin-console-stats.ts` + wire into the console home | | |
| 2 — a11y + e2e (360px fold guard, home-only guard) | | |
| 3 — full local verification, docs-freshness counting sweep, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/app/shared/stat-tile.ts` — **new.** The presentational stat tile: glass
  surface, uppercase label, projected value, optional sub-caption. No HTTP, no state.
- `frontend/src/app/shared/stat-tile.spec.ts` — **new.** Unit spec for the tile's three
  render states (value only, value + sub, sub omitted).
- `frontend/src/app/operator/console-stats-strip.html` — **modify.** Four inline tile blocks
  become four `<article appStatTile>` — no behavior change (parity ledger).
- `frontend/src/app/admin/admin-console-stats.ts` — **new.** The console home's four tiles:
  three counts in, the venue read its own, the mean computed, the footnote.
- `frontend/src/app/admin/admin-console-stats.spec.ts` — **new.** AC-1..AC-7.
- `frontend/src/app/admin/admin-operators.ts` — **modify.** Renders the strip below the tabs;
  exposes `countsKnown` + three count `computed()`s.
- `frontend/src/app/admin/admin-operators.spec.ts` — **modify.** `AdminCommissionsService`
  stub (R-6) + a case pinning that the strip dashes before the load settles.
- `frontend/src/app/admin/admin-operators.a11y.spec.ts` — **modify.** Same stub; AC-10.
- `frontend/src/app/admin/admin-commissions.service.ts` — **modify.** TSDoc only: name the
  second consumer.
- `frontend/e2e/admin-console-stats.e2e.ts` — **new.** AC-8, AC-9, AC-10 (real render, 360px).
- `docs/plans/a9-admin-console-stat-strip.md` — **new.** This plan.
- `docs/design/riviera-admin-console.dc.html` — **modify.** Header correction note: the
  stats-above-tabs-on-every-screen layout is a demo-page artefact; A9 renders them on the home
  only, below the tabs (same treatment the canvas's tab strip already carries).
- `CLAUDE.md` / `docs/…` — **modify if the counting sweep finds stale statements** (phase 3).

---

## Phase 0 — The shared stat tile, and the operator strip onto it

**Files:** Create `frontend/src/app/shared/stat-tile.ts`, `frontend/src/app/shared/stat-tile.spec.ts` · Modify `frontend/src/app/operator/console-stats-strip.html`

- [ ] **Step 1: Write the failing test** — `stat-tile.spec.ts`: a host renders
  `<article appStatTile label="Free today" valueTestId="t-value">2</article>` and asserts the
  label text, the value test id and text, and that **no** sub element exists; a second case
  passes `sub`/`subTestId` and asserts it renders.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- stat-tile` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — `StatTile` with `label`, `valueTestId`, `sub`,
  `subTestId` inputs; `hostDirectives: [CardGlass]`; host classes lifted verbatim from the
  operator tile.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- stat-tile` → PASS.
- [ ] **Step 5: Refactor `console-stats-strip.html`** onto it, then run the strip's own specs
  **unedited** — `npm test -- console-stats-strip` → PASS (AC-11's unit half).
- [ ] **Step 6: Generalization-audit pass** — search for other hand-rolled stat tiles.
- [ ] **Step 7: Commit** — `git commit -m "Extract the stat tile into shared/ (#348)"`
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The admin console stat strip

**Files:** Create `frontend/src/app/admin/admin-console-stats.ts`, `…/admin-console-stats.spec.ts` · Modify `…/admin-operators.ts`, `…/admin-operators.spec.ts`, `…/admin-commissions.service.ts`

- [ ] **Step 1: Write the failing test** — `admin-console-stats.spec.ts` covering AC-1..AC-7.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- admin-console-stats` → FAIL.
- [ ] **Step 3: Minimal implementation** — the component, then the `AdminOperators` wiring
  (`countsKnown` + three `computed()`s + the strip below `<app-admin-console-tabs>`).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- admin-console-stats admin-operators` → PASS.
- [ ] **Step 5: Generalization-audit pass** — the dash-vs-zero rule: search for other admin
  surfaces rendering a count that could be a failed read.
- [ ] **Step 6: Commit** — `git commit -m "Add the admin console stat strip (#348)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — a11y and e2e

**Files:** Modify `frontend/src/app/admin/admin-operators.a11y.spec.ts` · Create `frontend/e2e/admin-console-stats.e2e.ts`

- [ ] **Step 1: Write the failing tests** — the a11y spec's stub + a dashed-state audit
  (AC-10); the e2e's fold measurement (AC-8), home-only assertion (AC-9), axe (AC-10), and the
  footnote's verbatim text (R-1).
- [ ] **Step 2: Run them** — `npm run test:a11y`; `npm run test:e2e:a11y admin-console-stats`.
- [ ] **Step 3: Prove each guard fails on the mistake it exists to catch** — temporarily stack
  the tiles full-width (fold guard) and temporarily render the strip on the Commissions tab
  (home-only guard); revert both.
- [ ] **Step 4: Commit** — `git commit -m "Guard the stat strip's fold budget and scope (#348)"`
- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Verification, docs freshness, close-out

**Files:** Modify `docs/design/riviera-admin-console.dc.html`, this plan, plus whatever the sweep finds

- [ ] **Step 1:** `npm run lint`, `npm test`, `npm run test:a11y`, `npm run test:e2e:a11y` — all green.
- [ ] **Step 2:** Re-measure the 360px fold and record the numbers in the Execution status.
- [ ] **Step 3:** Run `riviera-docs-freshness`'s counting sweep over `a02c199..HEAD` — the
  target class is any statement that `console-stats-strip.ts` is operator-only, that the admin
  console has no stat strip, or that counts the console's above-fold chrome.
- [ ] **Step 4:** Canvas header correction note.
- [ ] **Step 5:** Finalize this plan (stage pointer DONE, `merged via PR #NN`) **in this PR**.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** `npm test -- admin-console-stats` → all pass. Verified at commit `<sha>`.
- [ ] **AC-8, AC-9:** `npm run test:e2e:a11y admin-console-stats` → pass. Verified at `<sha>`.
- [ ] **AC-10:** `npm run test:a11y` + the e2e's axe run → no violations. Verified at `<sha>`.
- [ ] **AC-11:** `npm test -- console-stats-strip` and `npm run test:e2e:a11y operator-console`
  → pass **with no spec edited**. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (N/A justified); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path.
- [ ] **Modulith** section filled (N/A, frontend-only); invariant #11 untouched.
- [ ] **Payment/payout** section filled — rate arithmetic only, no money math on the client (#5, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A, no date is rendered by this slice.
- [ ] Booking codes unguessable (invariant #7) — N/A, no code is rendered.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; `shared/`-vs-feature placement per `riviera-frontend`; no new
      cross-feature import (RV-FE-8); no `as any` on the contract.
- [ ] **RV-STYLE-1:** every inline comment in the diff is one line.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder
      *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
