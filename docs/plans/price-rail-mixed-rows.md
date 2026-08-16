# Beach-map price rail: honest chips for mixed-price rows (#689)

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A beach-map rail chip never presents the row's first set's price as the row's
price — a mixed-price row renders its span (`€35–€45`) on both map surfaces; uniform rows
render exactly as today.

**Architecture:** One shared pure helper, `formatMoneyRange` in `shared/money.ts` (the
single home of the money-display vocabulary), consumed by both map surfaces — the tourist
map (`venue/venue-map.ts`) and the operator daily view (`operator/daily-view-tab.ts`).
The chosen semantic is the **range** (issue #689 delegates the decision): it keeps
pricing-tab's "don't misrepresent a mixed row" stance without deleting the only visible
price on the daily view, and avoids overloading the venue-level "from €X / set"
vocabulary (which means the venue-wide minimum). Zone equality (`zoneStart`) compares the
rendered labels, so mixed rows group into zones coherently.

**Persistence:** N/A — frontend-only; no table, migration, or SQL touched (invariant #1
untouched).

**Source of intent:** GitHub issue #689 (review-gate finding deferred from PR #688 /
issue #686).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the two cited call sites, found the two *other* `priceLabel` producers are deliberate
editor-surface postures, no in-flight PR overlap) · `riviera-plan-doc` (this template —
forced the parity ledger row for the zoneStart currency comparison) · `tdd` (each phase
red→green, one behavior per cycle) · `riviera-review-overlay` (review gate — at
ready-for-review) · `riviera-docs-freshness` (N/A — no substrate doc states the rail's
price semantics; issue #689 is the record) · `riviera-frontend` (placement: the helper
belongs in `shared/money.ts`; `shared` imports nothing app-internal — holds) ·
`angular-developer` + angular-cli MCP (v22 posture: `computed()` derivation, no template
logic) · `playwright-cli` (the mocked-suite e2e assertion) · `riviera-local-debug`
(cloud npm/Vitest/Playwright recipes; scoped runs). `riviera-tailwind` N/A — no styling
authored: label strings only, no classes/SCSS touched.

**Branch:** `claude/issue-689-tba7tf` — the cloud session's designated remote branch
stands in for `bugfix/price-rail-mixed-rows` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given amounts that are all equal, when `formatMoneyRange` renders them,
  then the label is the single formatted price (`€35`), identical to `formatMoney`.
  *Pinned by:* `money.spec.ts` › `formatMoneyRange` › uniform case.
- [ ] **AC-2:** Given amounts with differing values (in any order), when
  `formatMoneyRange` renders them, then the label is `min–max` from integer minor units
  (`€35–€45`, en dash), fractional amounts keeping their two decimals. *Pinned by:*
  `money.spec.ts` › `formatMoneyRange` › mixed cases.
- [ ] **AC-3:** Given a tourist-map row whose sets carry different prices, when the map
  renders, then that row's rail chip reads the range and uniform rows are unchanged.
  *Pinned by:* `venue-map.spec.ts` › mixed-price row test.
- [ ] **AC-4:** Given a mixed-price row, when zones are derived, then the mixed row's
  label participates in zone equality — it starts a zone when its label differs from the
  previous row's. *Pinned by:* `venue-map.spec.ts` › mixed-price row test (chip count +
  zone gap assertions).
- [ ] **AC-5:** Given a daily-view row whose sets carry different prices, when the grid
  renders, then that row's rail chip reads the range. *Pinned by:*
  `daily-view-tab.spec.ts` › mixed-price row test.
- [ ] **AC-6:** Given the mocked e2e venue with one mixed-price row, when the tourist
  map renders in a real browser, then the rail chips show the range chip once for that
  zone. *Pinned by:* `venue-map-pan.e2e.ts` chip assertions.

## Non-goals

- The **set-editor** and **layout-editor** rail chips keep first-set semantics: both
  document it as a deliberate editing-surface posture (constant per-row chips so rows
  never reflow mid-gesture; a live reprice updates the chip in place). Out of scope per
  issue #689's "both **map** surfaces" framing.
- The venue-level `fromPrice` ("from €X / set" header / home card) — server-computed,
  venue-wide, untouched.
- No backend change: the map API already carries per-set prices.
- No blank-chip semantic — rejected in favor of the range (rationale in
  **Architecture**).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Uniform row renders its single price chip | preserved | `formatMoneyRange` of equal amounts returns exactly `formatMoney(first)` |
| Mixed row renders the **first set's** price | changed | the point of #689 — renders the `min–max` range instead |
| venue-map `zoneStart` compares first-set `minorUnits` **and** `currency` | changed (equivalent) | zones now compare rendered labels (daily-view's existing idiom); the label embeds the currency symbol, so a currency flip still starts a zone |
| daily-view `zoneStart` compares rendered labels | preserved | unchanged mechanism, now fed range-aware labels |
| Tourist tile `aria-label` carries the exact per-set price | preserved | `toTile` untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Money arithmetic drifts into floats (invariant #5) | low | high | min/max chosen by integer `minorUnits` comparison only; rendering stays in `formatMoney` | session | open |
| R-2 | Mixed currencies inside one row make a min–max by `minorUnits` meaningless | low | med | cannot occur in v1 (EUR-only collection, invariant #5); follows `pricing-tab`'s precedent of comparing `minorUnits` and rendering each bound with its own currency | session | open |
| R-3 | Zone regrouping shifts gaps for venues that already have mixed rows | med | low | deliberate: a mixed row is its own zone unless its neighbour renders the identical label; pinned by AC-4 | session | open |

## Open questions / Assumptions

### Resolved

- **Open question:** which rail semantic — range, "from €X", or blank? — *Resolved:*
  range, decided in this slice as issue #689 explicitly delegates ("Decide and implement
  one rail semantic"); rationale in **Architecture**. Reversal is one helper edit.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: display-only formatting of prices already delivered
by the map read; no availability read or write path changes.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Invariant #5 is honored in display: amounts stay integer
minor units end-to-end; the only new operation is integer comparison.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/money.ts` (`formatMoneyRange`) | existing file, new export | pure function | n/a | n/a |
| FE-2 | `venue/venue-map.ts` (`rows`) | existing | standalone component | `computed()` | n/a |
| FE-3 | `operator/daily-view-tab.ts` (`rows`) | existing | standalone component | `computed()` | n/a |

**Standards:** no deviations — derivation stays in `computed()`, templates untouched.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement (phase 3)

**Next action:** mixed-price row in the `venue-map-pan.e2e.ts` fixture + chip-text assertion

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `formatMoneyRange` helper | ✅ | b2af56d |
| 1 — tourist map (`venue-map.ts`) | ✅ | 2ff1dcd |
| 2 — daily view (`daily-view-tab.ts`) | ✅ | see branch |
| 3 — mocked e2e assertion | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/price-rail-mixed-rows.md` — this plan
- `frontend/src/app/shared/money.ts` — add `formatMoneyRange`
- `frontend/src/app/shared/money.spec.ts` — pin AC-1/AC-2
- `frontend/src/app/venue/venue-map.ts` — rows derive range-aware labels + label-equality zones
- `frontend/src/app/venue/venue-map.spec.ts` — pin AC-3/AC-4
- `frontend/src/app/operator/daily-view-tab.ts` — rows derive range-aware labels
- `frontend/src/app/operator/daily-view-tab.spec.ts` — pin AC-5
- `frontend/e2e/venue-map-pan.e2e.ts` — mixed row in the fixture + chip-text assertion (AC-6)

---

## Phase 0 — `formatMoneyRange` helper

**Files:** Modify `frontend/src/app/shared/money.ts` · Test `frontend/src/app/shared/money.spec.ts`

- [ ] **Step 1: Write the failing test** — uniform → single price; mixed → `min–max`
  regardless of input order; fractional bounds keep decimals.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- --include '**/money.spec.ts'` → FAIL (no export)
- [ ] **Step 3: Minimal implementation** — integer min/max scan + `formatMoney` per bound.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS
- [ ] **Step 5: Generalization-audit pass** — population: every producer of
  `BeachMapCanvasRow.priceLabel` (see log).
- [ ] **Step 6: Commit** — `git commit -m "Add formatMoneyRange for mixed-price rows (#689)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — tourist map

**Files:** Modify `frontend/src/app/venue/venue-map.ts` · Test `frontend/src/app/venue/venue-map.spec.ts`

- [ ] Red: mixed-price Row 2 (3500 + 4500) renders chip `€35–€45`; other chips unchanged;
  the mixed row starts its own zone. Green: `rows` maps each row through
  `formatMoneyRange`, `zoneStart` compares labels. Scoped run: `venue-map.spec.ts`.
  Commit + status.

## Phase 2 — daily view

**Files:** Modify `frontend/src/app/operator/daily-view-tab.ts` · Test `frontend/src/app/operator/daily-view-tab.spec.ts`

- [ ] Red: row A seeded with 2500/3000 prices renders chip `€25–€30`. Green: `rows` maps
  through `formatMoneyRange`. Scoped run: `daily-view-tab.spec.ts`. Commit + status.

## Phase 3 — mocked e2e

**Files:** Modify `frontend/e2e/venue-map-pan.e2e.ts`

- [ ] Make Row 3 mixed in the fixture (3500/4500 alternating), assert the rendered chip
  texts `['€50', '€40', '€35–€45', '€30']` (count stays 4 — rows 4+5 still share €30).
  Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-map-pan`.
  Commit + status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | Phase 0 (the fix's mechanism: a rail chip derived from one set's price) | every producer of `BeachMapCanvasRow.priceLabel` | `grep -rn "priceLabel" frontend/src/app --include='*.ts' \| grep -v spec` | `venue-map.ts`, `daily-view-tab.ts`, `set-editor.ts`, `layout-editor.ts` (+ two `fromPrice` venue-header labels, different mechanism) | fix the two map surfaces; editors keep first-set chips deliberately (documented posture: constant per-row chips, rows never reflow mid-gesture) — recorded in Non-goals |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `npm test -- --include '**/money.spec.ts'` → PASS.
- [ ] **AC-3/AC-4:** `npm test -- --include '**/venue-map.spec.ts'` → PASS.
- [ ] **AC-5:** `npm test -- --include '**/daily-view-tab.spec.ts'` → PASS.
- [ ] **AC-6:** mocked e2e `venue-map-pan` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.
