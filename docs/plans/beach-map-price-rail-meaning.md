# Beach Map Price-Rail Meaning Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On the tourist beach map, each per-zone rail chip says what the price buys —
`€45 · Front row`, `€35`, `€25 · at venue` — instead of a bare amount whose tier/pool
meaning rides on fill colour alone, without widening the rail at the cost of the tiles.

**Architecture:** One decision, in one pure function. `venue/row-price-label.ts` composes
a row's chip text from facts the map already holds — the rendered price (single or the
#689 min–max span) plus **one** qualifier resolved by a stated priority: walk-in channel
(`at venue`) → the venue's own row label minus its positional segments → the premium tier
name (`Front row`) → nothing. The canvas's `BeachMapCanvasRow.priceLabel` contract is
**unchanged**, so the three operator surfaces keep their current rail labels by
construction, and zones keep being "a run of rows whose rendered label matches" (#689's
own rule) — which now splits a walk-in row out of an equally-priced online zone for free.
The only shared-chrome change is a CSS cap (`max-w` + `truncate`) so a long venue label
ellipsizes instead of stealing tile width.

**Persistence:** N/A — frontend-only slice; no table, no migration, no SQL (invariant #1
untouched). Row labels are read from the existing venue read model.

**Source of intent:** GitHub issue #702. Visual reference: the "Refined" artboards
(desktop + mobile) on the Beach Map Refinement design canvas
(`https://claude.ai/code/artifact/464f8512-ec58-441f-aeca-284b484abe71`), whose rails
specify the chips verbatim — desktop `['€50 · Front row', '€40', '€35', '€30 · Back',
'At venue']`, mobile shortened to `'€50 · Front'`, chip `border-radius: 999px; background:
rgba(255,255,255,0.8); border: 1px solid #cfe3df; padding: 3px 10px; font-size: 11px;
font-weight: 700; color: #0a4f5e; white-space: nowrap`, rail column `min-width: 128px`
(desktop) / unset (mobile). Two deliberate departures from the artboard, both taken from
the issue's own ACs: the walk-in chip **keeps its price** (`€30 · at venue`, not the
artboard's bare `At venue` — the price is real information a tourist compares), and the
mobile shortening is done by **truncation**, not by a second hand-written label, because
the words are venue-authored (see D-2, D-3).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
slice's premise drift: the operator layout editor writes `rowLabel` as a bare `A`/`B`/`C`
(`layout-editor.ts:516` → `gridRowLabel`), so **every venue created in-product carries no
descriptive row label at all** and the issue's "the row labels the venue payload already
carries" holds only for the V3 demo seed — which is what forced the tier/pool fallbacks
into the rule instead of a plain `price · rowLabel` concatenation; also confirmed no
Flyway number and no in-flight overlap — the only open PRs are Dependabot bumps, and
#700/#701, the sibling design-critique slices, are merged and closed) · `riviera-plan-doc`
(this template — its Behavior-parity ledger is what surfaced that zone *grouping* is an
existing behavior riding on the label string, so enriching the label silently re-partitions
the zones; that became AC-4 rather than a surprise at review) · `tdd` (each phase red
first: the label-rule spec before the function, the re-partitioned zone spec before the
wiring, the 390 px geometry pin before the CSS cap) · `riviera-review-overlay` (review
gate — <ran at ready-for-review>) · `riviera-docs-freshness` (<ran over range, findings>)
· `riviera-frontend` (placement: the rule is tourist-map vocabulary with exactly one
consumer, so it colocates flat in the `venue/` feature next to `map-tile.ts` — **not**
`shared/`, which no second feature needs; the rail's CSS cap *is* shared chrome, so it
belongs on `shared/beach-map-canvas.html`) · `riviera-tailwind` (rule 2 — the
`[data-testid="row-price"]` hook and the chip's shipped utility set are retained verbatim,
the cap is additive; `text-[11px]`-style arbitrary sizes over named ones; no `@apply` for
the shared cap — it is one element on one shared template, not a directive) ·
`angular-developer` + angular-cli MCP (`get_best_practices`: `computed()` for derived
state, no `ngClass`/`ngStyle`, native control flow — the row model stays a `computed()`
over `venue()`, and the new rule is a pure module function, not a pipe or a service) ·
`playwright-cli` (the new e2e assertions are test-id located with web-first `expect` and
`getBoundingClientRect`/`scrollWidth` reads, no fixed sleeps) · `riviera-local-debug`
(scoped Vitest runs + `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked
e2e — never `playwright install`).

**Branch:** `claude/sdlc-702-qjmdnc` — the cloud session's **designated** branch, standing
in for `feature/beach-map-price-rail-meaning` (`riviera-sdlc` § Remote / cloud session
addendum). Cut fresh from `origin/main` at `b19ece2`.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

- [ ] **AC-1:** Given a premium zone whose row label carries words beyond its position
      (`Front row · Sea view`), when the map renders, then its chip reads
      `€45 · Front row` — the price plus the label's first non-positional segment.
      *Pinned by:* `row-price-label.spec.ts › 'names a descriptive row by its first
      non-positional segment'` + `venue-map.spec.ts › 'renders the price once per zone,
      carrying the row's meaning (#702)'`
- [ ] **AC-2:** Given a premium zone whose row label states only its position (`A`,
      `Row 1` — what the operator layout editor writes), when the map renders, then its
      chip still names the tier (`€50 · Front row`, from `tierLabel('PREMIUM')`), and an
      equivalent **standard** zone renders the price alone (`€35`), exactly as on `main`.
      *Pinned by:* `row-price-label.spec.ts › 'falls back to the tier name for a
      positional-only premium row'` + `… › 'leaves a positional-only standard row as the
      bare price'`
- [ ] **AC-3:** Given a zone whose sets are all `WALK_IN`, when the map renders, then its
      chip reads `€25 · at venue` — price retained, channel stated — regardless of the
      row's label or tier. *Pinned by:* `row-price-label.spec.ts › 'states the at-venue
      channel for a walk-in row, price retained'` + `venue-map.spec.ts › 'renders the
      price once per zone, carrying the row's meaning (#702)'`
- [ ] **AC-4:** Given adjacent rows at the **same** price but different channels (an
      online `Row 4 · Back` and a walk-in `Row 5 · Walk-in`, both €30 — today one zone
      with one chip), when the map renders, then they are two zones: two chips
      (`€30 · Back`, `€30 · at venue`) and a zone gap between them on all three columns.
      *Pinned by:* `venue-map.spec.ts › 'splits an equally-priced walk-in row into its own
      zone (#702)'` + `venue-map-pan.e2e.ts › 'a plain click on a free tile opens the
      booking dialog (and the map is accessible)'` (its `row-price` pin)
- [ ] **AC-5:** Given a row whose sets differ in price, when the map renders, then its
      chip keeps the #689 min–max span and composes the qualifier onto it
      (`€35–€45`, or `€35–€45 · Front row` when the row is named). *Pinned by:*
      `row-price-label.spec.ts › 'composes the qualifier onto a mixed-price span (#689)'`
      + the updated `venue-map.spec.ts › 'renders a mixed-price row as its min–max span,
      in a zone of its own (#689)'`
- [ ] **AC-6:** Given the rendered map, when a screen reader reads it, then the price rail
      is still `aria-hidden` and every tile's accessible name is **byte-identical** to
      `main`'s (`Set A1, Front row · Sea view, front row, €45, available`) — the new words
      are announced nowhere. *Pinned by:* `venue-map.spec.ts › 'keeps the enriched rail
      decorative — tile names are unchanged (#702)'`
- [ ] **AC-7:** Given a venue whose row label is pathologically long (40 chars) at a
      390 × 760 viewport, when the map renders, then the price rail is **no wider than
      92 px**, its chip is ellipsis-truncated (`scrollWidth > clientWidth`), and the tile
      viewport is no narrower than it is for the same venue with a short label — a long
      label costs the tiles nothing. *Pinned by:* `venue-map-pan.e2e.ts › 'a long row
      label truncates in the rail instead of eating the tile grid (#702)'`
- [ ] **AC-8:** Given the three operator beach-map surfaces (layout editor, Daily view,
      per-set editor), when they render, then their rail chips are unchanged bare prices
      and no operator spec needs an edit. *Pinned by:* the unedited
      `layout-editor.spec.ts`, `daily-view-tab.spec.ts`, `set-editor.spec.ts` price
      assertions + `operator-daily.e2e.ts` / `layout-editor.e2e.ts` staying green.
- [ ] **AC-9:** Given the beach map at 390 px, when axe runs over it, then there are no
      serious violations. *Pinned by:* `venue-map-pan.e2e.ts ›` the new spec's
      `expectNoSeriousAxeViolations` call.

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **Letting operators name their rows.** The premise drift the grill found (in-product
  venues carry `A`/`B`/`C` labels, so only the tier/pool fallbacks fire for them) is real
  and worth fixing — but a row-label input in the layout editor is a venue-module slice
  with its own API surface, not this one. Recorded as a follow-up (see Open questions).
- Changing tile accessible names, the legend (#701), or any tile appearance.
- Changing the operator surfaces' rail labels (the issue explicitly fences them off).
- Re-opening the zone definition beyond what the enriched label implies — zones remain
  "a run of rows whose rendered chip label matches".
- A second, hand-written short label for narrow viewports (the artboard's `€50 · Front`);
  the words are venue-authored, so the narrow case is handled by truncation (D-3).

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

The replaced surface is the rail chip's **label string** and everything that reads it.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Chip renders `formatMoney(price)` for a uniform row | changed | now `price` + optional ` · qualifier`; a standard positional-only row is byte-identical to before |
| Chip renders the `formatMoneyRange` min–max span for a mixed-price row (#689) | preserved | the span is still the price half; the qualifier composes onto it (AC-5) |
| One chip per **zone**, where a zone is a run of rows with an equal rendered label (#672/#689) | preserved *mechanism*, changed *partition* | the comparison still runs on the rendered label — but the label now carries channel/tier, so an equally-priced walk-in row leaves the online zone (AC-4, intended) |
| Zone gap (`mt-3`) drawn on all three columns at a zone start | preserved | unchanged code path; it follows `zoneStart`, which follows the label comparison |
| `priceLabel: null` renders no chip (operator per-set editor's empty row) | preserved | the composer is only called by the tourist map; `null` still short-circuits in the canvas template |
| Rail is `aria-hidden`, tiles carry row + price in their accessible names | preserved | untouched — `toTile()` is not edited (AC-6) |
| Rail cell is `min-w-[52px]`, chip is unconstrained in width | changed | `min-w` kept; a `max-w` cap + `truncate` added so a long label ellipsizes (AC-7) |
| Operator surfaces pass `formatMoney(...)`/`null` as `priceLabel` | preserved | the canvas contract is unchanged; no operator file is touched (AC-8) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The enriched label silently re-partitions zones, changing chip counts and gaps on maps nobody re-checked | high | med | made an explicit AC (AC-4) with both a unit and an e2e pin; the ledger row states the mechanism is preserved and only the partition moves | claude | open |
| R-2 | A long venue-authored label steals tile width at 390 px (the rail is `shrink-0`; the tile viewport is `flex-1 min-w-0`, so it, not the rail, pays) | high | med | `max-w-[92px] sm:max-w-[128px]` + `truncate` on the chip; pinned by the 390 px geometry e2e (AC-7) | claude | open |
| R-3 | The qualifier heuristic swallows a real word it mistakes for a row ordinal (a row genuinely named `AA`, or `VIP` mis-matched) | med | low | the positional pattern is anchored and narrow — `(row )?` + 1–2 letters **or** 1–3 digits — so 3+-letter words (`VIP`, `Bar`, `Sea`) always survive; each shape is a unit case | claude | open |
| R-4 | The shared canvas cap changes an operator surface's rendering | low | med | the cap is a `max-width`, and every operator label is a bare `formatMoney` string far under it; AC-8 leaves their specs unedited as the proof | claude | open |
| R-5 | Duplicate announcement — the qualifier reaching AT twice (rail + tile name) | low | med | rail stays `aria-hidden`; `toTile()` untouched and pinned byte-for-byte (AC-6) | claude | open |
| R-6 | The e2e chip pin is a plain-text array; the 5-row wide fixture now yields 5 chips, so a stale 4-item expectation fails CI late | high | low | the pin is updated in the same phase as the wiring, not at the end | claude | open |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Assumption (D-1):** "The row labels the venue payload already carries" is true only of
  the V3 demo seed; in-product venues carry `A`/`B`/`C` from the layout editor. The rule
  therefore falls back to the tier name and the walk-in channel, which the issue's own AC-1
  sanctions ("or equivalent from the venue's own row label"). *Owner:* claude · *Resolves
  by:* phase 0 (encoded + unit-pinned).
- **Assumption (D-2):** The walk-in chip keeps its price (`€25 · at venue`) per the issue,
  departing from the artboard's bare `At venue`. *Owner:* claude · *Resolves by:* phase 1.
- **Assumption (D-3):** The artboard's hand-shortened mobile label (`€50 · Front`) is
  reproduced by CSS truncation rather than a second label, because the words come from the
  venue, not from us. *Owner:* claude · *Resolves by:* phase 2.
- **Open question (Q-1):** Should the operator layout editor let a venue *name* its rows,
  so a real venue's chips can say `Front row` / `Back` from its own words rather than from
  our tier fallback? Out of scope here (Non-goals). *Owner:* maintainer · *Resolves by:*
  a follow-up issue filed at merge close-out.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice is display-only: it re-renders an existing
read model (`GET /api/venues/{id}`) and writes nothing. No channel writes
`availability(set_id, booking_date)` in this diff; the tourist's bookable-tile rule
(invariant #3: free **and** `ONLINE`) is untouched in `toTile()`, and no cutoff arithmetic
(#4) is read or re-derived. The walk-in qualifier is a *label* over the same `pool` field
the tile appearance already resolves from (`mapTileState`), never a second source of truth.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file, port, event, or module boundary is touched; the
venue read model is consumed exactly as it is served today.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.` The frontend-side placement
answer (which folder owns the new rule) is `riviera-frontend`'s and is recorded in the
Angular section below.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` Money is rendered, never computed: the chip reuses
`shared/money.ts`'s `formatMoney`/`formatMoneyRange` on the integer minor units the API
already sends (invariant #5 — no float, no arithmetic added, no new rounding site).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/row-price-label.ts` | new | pure module functions (no DI) | none — pure | N/A |
| FE-2 | `venue/venue-map.ts` | existing | standalone component | `computed()` `rows` over the `venue` signal | N/A |
| FE-3 | `shared/beach-map-canvas.html` | existing | shared component template | unchanged | N/A |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, `NgOptimizedImage` for new images. No deviation: the new code is a pure function plus
two template class edits; the row model stays a `computed()`, per the angular-cli MCP
best-practices guidance to keep derived state in `computed()` and out of the template.

**Placement (`riviera-frontend`):** `row-price-label.ts` is tourist-map vocabulary with one
consumer, so it sits flat inside the `venue/` feature beside `map-tile.ts` (the #701
precedent for tourist-only vocabulary), importing only `shared/` (`money.ts`,
`set-label.ts`, `venue-views.ts`) — the one-way import direction holds.

## FE↔BE contract

`N/A — no contract change.` `SetView.rowLabel`, `.tier`, `.pool`, `.price` are all already
served by `GET /api/venues/{id}` and consumed by this component today.

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation.

**Stage pointer:** `plan — committed; entering implement (phase 0)`

**Next action:** Write `venue/row-price-label.spec.ts` red, then the rule.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the label rule (pure) | | |
| 1 — wire it into the tourist map + re-partitioned zones | | |
| 2 — rail truncation cap + e2e pins | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/beach-map-price-rail-meaning.md` — this plan
- `frontend/src/app/venue/row-price-label.ts` — the chip-label rule (new)
- `frontend/src/app/venue/row-price-label.spec.ts` — its unit spec (new)
- `frontend/src/app/venue/venue-map.ts` — `rows` computes the composed label; zones compare it
- `frontend/src/app/venue/venue-map.spec.ts` — chip, zone-split and a11y pins
- `frontend/src/app/shared/beach-map-canvas.ts` — rail doc comment (the chip may now carry meaning, and its width is capped)
- `frontend/src/app/shared/beach-map-canvas.html` — the rail cap + chip truncation
- `frontend/e2e/venue-map-pan.e2e.ts` — updated chip pin + the 390 px truncation spec

---

## Phase 0 — The label rule (pure)

**Files:** Create `frontend/src/app/venue/row-price-label.ts` · Test
`frontend/src/app/venue/row-price-label.spec.ts`

- [ ] **Step 1: Write the failing test** — every branch of the priority: walk-in channel,
      descriptive label, positional-only + premium, positional-only + standard, mixed-price
      span composition, and the R-3 shapes (`AA`, `Row 12`, `VIP`).
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/venue/row-price-label.spec.ts`
      → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — `rowPriceLabel(sets)` returning
      `price` or `price · qualifier`, with `POSITIONAL_SEGMENT` anchored per R-3.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every surface that renders a
      `priceLabel` into the shared rail.
- [ ] **Step 6: Commit** — `git commit -m "Compose the tourist map's rail chip from price + row meaning (#702)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Wire it into the tourist map

**Files:** Modify `frontend/src/app/venue/venue-map.ts` · Test
`frontend/src/app/venue/venue-map.spec.ts`

- [ ] **Step 1: Write the failing tests** — the enriched per-zone chip list, the walk-in
      zone split (chips + `mt-3` on all three columns), the updated #689 span pin, and the
      unchanged-tile-name pin (AC-6).
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/venue/venue-map.spec.ts`.
- [ ] **Step 3: Minimal implementation** — `rows` maps each row's sets through
      `rowPriceLabel`; `zoneStart` compares the composed labels (the #689 rule, unchanged).
- [ ] **Step 4: Run it, verify it passes** — same command, then the whole `venue/` folder.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Split zones by chip meaning, not price alone (#702)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — Rail truncation cap + e2e pins

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.html`,
`frontend/src/app/shared/beach-map-canvas.ts` · Test `frontend/e2e/venue-map-pan.e2e.ts`

- [ ] **Step 1: Write the failing test** — the 390 px spec: a 40-char row label, rail
      ≤ 92 px, chip truncated, tile viewport no narrower than the short-label control, axe
      clean; plus the updated 5-chip pin on the wide venue.
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- venue-map-pan`.
- [ ] **Step 3: Minimal implementation** — `max-w-[92px] sm:max-w-[128px]` on the rail cell,
      `min-w-0 max-w-full truncate` on the chip; refresh the canvas doc comment.
- [ ] **Step 4: Run it, verify it passes** — same command; then the full mocked e2e suite.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Cap the price rail so a long row label never costs tile width (#702)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-6:** `npx vitest run src/app/venue/` → all green.
- [ ] **AC-7, AC-9:** `npm run test:e2e:a11y -- venue-map-pan` → green.
- [ ] **AC-8:** `npx vitest run src/app/operator/` → green with no operator spec edited
      (`git diff --stat origin/main -- frontend/src/app/operator` is empty).

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
