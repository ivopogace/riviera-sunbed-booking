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
gate — **ran** at ready-for-review, layered on `/code-review` at high effort over
`origin/main...HEAD` after the maintainer authorized the subagent fan-out — this session
carries a standing "no Agent tool unless asked" instruction, which `pr-gates.md` §1 says to
resolve by asking, not by skipping. 2 findings, 1 fixed and 1 answered — and the fix round, **re-reviewed** per the
re-entry rule, produced 2 more (G-1, G-2): my own F-1 fix had over-generalized, which is
exactly the case for re-running the gate rather than hand-waving a one-line change — and
re-reviewing *that* round found 3 more (H-1..H-3), one of them a regression the G-fix had
introduced — and the round after that found I-1, a zone artifact H-2's fix had created, plus
I-2, which is older than the slice and now issue #724. Four rounds, each catching the
previous round's own mistake; the rule ended simpler than any single round left it. The
overlay's own
RV-FE bank walked on top: RV-FE-3 money-from-the-wire, RV-FE-5 picker a11y, RV-FE-7 Tailwind +
no-drift, RV-FE-E2E suite placement, RV-FE-8 no new cross-feature import, RV-STYLE-1/2 and
RV-PROC-1 — the fix round pulled in no new area, so this line is unchanged apart from this
parenthesis) · `riviera-docs-freshness` (**ran** pre-merge over
`origin/main...HEAD`, **0 findings**: the rename grep returned nothing at all — no substrate
doc states anything about the price rail, the chip's wording, or how a zone is defined — and
the counting sweep found nothing this slice made the Nth of: the e2e split is still two
suites, the SCSS count is untouched at 8, the canvas still has three content slots and two
rails, and `shared/set-label.ts`'s "three tier variants by design" survives precisely
because the chip reuses `tierLabel` rather than minting a fourth spelling, which is what the
I-round decided)
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

- [x] **AC-1:** Given a premium zone whose row label carries words beyond its position
      (`Front row · Sea view`), when the map renders, then its chip reads
      `€45 · Front row` — the price plus the label's first non-positional segment.
      *Pinned by:* `row-price-label.spec.ts › 'names a descriptive row by its first
      non-positional segment'` + `venue-map.spec.ts › 'renders the price once per zone,
      carrying the row's meaning (#672, #702)'`
- [x] **AC-2:** Given a premium zone whose row label states only its position (`A`,
      `Row 1` — what the operator layout editor writes), when the map renders, then its
      chip still names the tier (`€50 · Front row`, from `tierLabel('PREMIUM')`), and an
      equivalent **standard** zone renders the price alone (`€35`), exactly as on `main`.
      *Pinned by:* `row-price-label.spec.ts › 'falls back to the tier name for a
      positional-only premium row'` + `… › 'leaves a positional-only standard row as the
      bare price'`
- [x] **AC-3:** Given a zone whose sets are all `WALK_IN`, when the map renders, then its
      chip reads `€25 · at venue` — price retained, channel stated — regardless of the
      row's label or tier. *Pinned by:* `row-price-label.spec.ts › 'states the at-venue
      channel for a walk-in row, price retained'` + `venue-map.spec.ts › 'renders the
      price once per zone, carrying the row's meaning (#672, #702)'`
- [x] **AC-4:** Given adjacent rows at the **same** price but different channels (an
      online `Row 4 · Back` and a walk-in `Row 5 · Walk-in`, both €30 — today one zone
      with one chip), when the map renders, then they are two zones: two chips
      (`€30 · Back`, `€30 · at venue`) and a zone gap between them on all three columns.
      *Pinned by:* `venue-map.spec.ts › 'splits an equally-priced walk-in row into its own
      zone (#702)'` + `venue-map-pan.e2e.ts › 'a plain click on a free tile opens the
      booking dialog (and the map is accessible)'` (its `row-price` pin)
- [x] **AC-5:** Given a row whose sets differ in price, when the map renders, then its
      chip keeps the #689 min–max span and composes the qualifier onto it
      (`€35–€45`, or `€35–€45 · Front row` when the row is named). *Pinned by:*
      `row-price-label.spec.ts › 'composes the qualifier onto a mixed-price span (#689)'`
      + the updated `venue-map.spec.ts › 'renders a mixed-price row as its min–max span,
      in a zone of its own (#689)'`
- [x] **AC-6:** Given the rendered map, when a screen reader reads it, then the price rail
      is still `aria-hidden` and every tile's accessible name is **byte-identical** to
      `main`'s (`Set A1, Front row · Sea view, front row, €45, taken` — A1 is the fixture's taken seat) — the new words
      are announced nowhere. *Pinned by:* `venue-map.spec.ts › 'keeps the enriched rail
      decorative — tile names are unchanged (#702)'`
- [x] **AC-7:** Given two venues whose front-row labels both exceed the rail's cap (18 and
      69 chars) at a 390 × 760 viewport, when their maps render, then both rails are **≤ 92 px
      and identical in width**, both chips are ellipsis-truncated (`scrollWidth > clientWidth`),
      and both tile viewports are identical and ≥ 150 px (three tile columns) — past the cap,
      extra characters cost the tiles nothing. *Pinned by:* `venue-map-pan.e2e.ts › 'a long row
      label truncates in the rail instead of eating the tile grid (#702)'`
      <!-- Restated at phase 2 from "no narrower than the same venue with a SHORT label": with a
      short label the rail is narrower and the viewport WIDER, so that comparison could never be an
      equality. Two over-cap labels of very different lengths pin the property that matters — the
      cap is a hard stop — and the absolute ≥ 150 px pins that the stop is set somewhere reasonable. -->
- [x] **AC-8:** Given the three operator beach-map surfaces (layout editor, Daily view,
      per-set editor), when they render, then their rail chips are unchanged bare prices
      and no operator spec needs an edit. *Pinned by:* the unedited
      `layout-editor.spec.ts`, `daily-view-tab.spec.ts`, `set-editor.spec.ts` price
      assertions + `operator-daily.e2e.ts` / `layout-editor.e2e.ts` staying green.
- [x] **AC-9:** Given the beach map at 390 px, when axe runs over it, then there are no
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
| R-1 | The enriched label silently re-partitions zones, changing chip counts and gaps on maps nobody re-checked | high | med | made an explicit AC (AC-4) with both a unit and an e2e pin; the ledger row states the mechanism is preserved and only the partition moves | claude | closed — and it fired: I-1 was exactly this risk in its subtler form (a *premium* re-partition nobody asked for), caught by the review gate and pinned by `venue-map.spec.ts › 'keeps two identically-priced premium rows in one zone (#702)'` |
| R-2 | A long venue-authored label steals tile width at 390 px (the rail is `shrink-0`; the tile viewport is `flex-1 min-w-0`, so it, not the rail, pays) | high | med | `max-w-[92px] sm:max-w-[128px]` + `truncate` on the chip; pinned by the 390 px geometry e2e (AC-7) | claude | closed — measured at 170 px before the cap, ≤ 92 px after, with the tile viewport identical across an 18- and a 69-character label |
| R-3 | The qualifier heuristic swallows a real word it mistakes for a row ordinal (a row genuinely named `AA`, or `VIP` mis-matched) | med | low | the positional pattern is anchored and narrow — `(row )?` + 1–2 letters **or** 1–3 digits — so 3+-letter words (`VIP`, `Bar`, `Sea`) always survive; each shape is a unit case | claude | closed — the risk was real and the first two mitigations were both wrong: F-1 (English-only), then G-1 (any `<word> <ref>`, which ate `Cabana 5`). It ended where it should have started: a word plus a reference is positional only when the reference is **this row's** own, while a bare code always is |
| R-4 | The shared canvas cap changes an operator surface's rendering | low | med | the cap is a `max-width`, and every operator label is a bare `formatMoney` string far under it; AC-8 leaves their specs unedited as the proof | claude | closed — no operator file or spec is in the diff; their specs and e2e pass untouched |
| R-5 | Duplicate announcement — the qualifier reaching AT twice (rail + tile name) | low | med | rail stays `aria-hidden`; `toTile()` untouched and pinned byte-for-byte (AC-6) | claude | closed — and the pin earned itself: it is why I-2 (an older tile-name inconsistency) had to go to #724 rather than be patched here |
| R-6 | The e2e chip pin is a plain-text array; the 5-row wide fixture now yields 5 chips, so a stale 4-item expectation fails CI late | high | low | the pin is updated in the same phase as the wiring, not at the end | claude | closed — updated in phase 2 with the wiring; CI never saw a stale pin |

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

### Resolved

- **Open question (Q-1):** Should the operator layout editor let a venue *name* its rows,
  so a real venue's chips can say `Front row` / `Back` from its own words rather than from
  our tier fallback? → **Filed as issue #723** (with the length-bound and rail-code
  questions it has to settle first). Out of scope here per Non-goals.
- **D-1, D-2, D-3** (the three assumptions above) → all encoded and pinned: D-1 by the
  fallback ladder's specs, D-2 by the walk-in cases, D-3 by the 390 px truncation e2e.

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

**Stage pointer:** `DONE — merged via PR #722`

**Next action:** None in the repo. GitHub-only close-out: #702 closes with the PR; the two
deferred findings are already written onto their homes (#723 the operator row-naming slice,
#724 the tile-accessible-name mismatch). This slice belongs to no tracking epic, so there is
no parent checklist to tick.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the label rule (pure) | ✅ | `116442f` |
| 1 — wire it into the tourist map + re-partitioned zones | ✅ | `b7c4b87` |
| 2 — rail truncation cap + e2e pins | ✅ | `c6e5748` |
| review gate — F-1 fixed, F-2 answered | ✅ | `16e538c` |
| re-review of the fix round — G-1, G-2 | ✅ | `9a2e80a` |
| re-review of the G-round — H-1, H-2, H-3 | ✅ | `96ca661` |
| re-review of the H-round — I-1 fixed, I-2 deferred | ✅ | `8897d96` |
| re-review of the I-round — plan-doc drift only | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate | `POSITIONAL_SEGMENT` only knew the **English** word `row`, so an Albanian-riviera venue's own label (`Rreshti 4 · Prapa`) chipped `€30 · Rreshti 4` — restating the position the left rail already shows and dropping the word that carried the meaning | fixed-in-`this commit`: the leading word is now matched, never named (`/^(\p{L}+\s+)?(\p{L}{1,2}\|\d{1,3})$/u`), pinned by `row-price-label.spec.ts › 'reads a positional segment in the venue's own language, not just English'`; the two-word-name guard (`Sea view`, `2nd row`) is pinned beside it |
| G-1 | re-review of the F-1 fix | the fix over-generalized: matching the leading word as `\p{L}+` made **any** `<word> <code/ordinal>` positional, so `Cabana 5`, `VIP 2`, `Terrace 2` lost the venue's own name — and on a **premium** row the tier fallback then renamed it `Front row`, which is wrong information, not merely missing information | fixed-in-`this commit`: "positional" now means *this row's actual position* rather than a guessed vocabulary — `rowPriceLabel(sets, position)` takes the row's `{code, ordinal}` and a segment is skipped only when its code/ordinal **is** that row's own. `Cabana 5` is positional on row 5 and a name everywhere else. Pinned by `row-price-label.spec.ts › "keeps a name whose number is not this row's number"`, whose premium case is the wrong-information half |
| G-2 | re-review of the F-1 fix | a spec comment claimed a two-word guard ("only a bare code or ordinal is positional") that the code did not implement, and the case under it passed for an unrelated reason — the comment is what hid G-1 | fixed-in-`this commit`: the misleading comment and its accidental case are gone; the rule's real boundary is pinned by the G-1 cases instead |
| H-1 | re-review of the G-round | **regression from G-1's own fix**: judging every segment against this row's position meant a *bare* code no longer dropped unless it matched. The map derives rail codes from insertion order while the venue's labels come from grid rows, so a **walkway** row (all-gap, saved as no sets) shifts them — the venue's `C` lands on rail `B` and chipped `€35 · C` beside a chip reading `B` | fixed-in-`this commit`: the two shapes are judged differently by what dropping them costs. A **bare** code/ordinal has no words to lose, so it goes regardless of position; only a **word plus** a reference (`Row 4`, `Cabana 5`) needs the reference to be this row's own. Pinned by `row-price-label.spec.ts › 'drops a bare code the map itself did not derive…'` and, end-to-end, `venue-map.spec.ts › 'drops a bare row label the rail cannot echo…'` |
| H-2 | re-review of the G-round | the tier fallback names **any** positional-only all-premium row `Front row` — including a premium row 5 (a VIP cabana block), told it is at the water | **no change, by decision — and one round of getting it wrong.** The H-round did gate it on `position.ordinal === 1`; I-1 then showed that gate splits a homogeneous premium block in two, so it was reverted in the same round that answered this properly: `Front row` is the premium tier's name in this app (`shared/set-label.ts` `tierLabel`), and the same map card's **legend** already labels every premium tile with it (#701) — so the chip agrees with the surface it sits on. Reconciling the three tier spellings across surfaces is a product decision `set-label.ts` explicitly reserves as a non-goal; making it here, unilaterally, would be the larger error. The spatial reading is real but pre-dates this slice |
| H-3 | re-review of the G-round (note) | `rowCode(index)` was derived twice per row in `VenueMap.rows` — once for the chip's position, once for the rail code | fixed-in-`this commit`: derived once into `positions`, read by both |
| I-1 | re-review of the H-round | H-2's `ordinal === 1` gate split a homogeneous premium block: two identically-priced all-premium rows read `€50 · Front row` then `€50`, and since zones compare the rendered label, that drew a spurious second chip and gap | fixed-in-`this commit` by **reverting H-2's gate**, which also answers H-2 itself (below). Pinned by `row-price-label.spec.ts › "names the premium tier whatever row it is on…"` and, end-to-end, `venue-map.spec.ts › 'keeps two identically-priced premium rows in one zone (#702)'` |
| I-2 | re-review of the H-round | a tile's accessible name carries two row identities that need not agree (`Set B1, C, …` on a walkway-shifted venue), so H-1's fix reaches sighted users only | **deferred → issue #724.** Older than this slice (`toTile` has combined the derived seat code with the raw `rowLabel` since the map was built) and out of its scope by construction: AC-6 pins tile names byte-identical to `main` so the rail's new wording cannot leak into screen-reader output. The fix wants one decision applied to every surface that prints a set's identity — map, dialog, confirmation, mail — not a patch in `toTile` |
| F-2 | review gate | A row painted with **mixed** pools renders a bare span (`€25–€30`) with no channel note, so the rail advertises a price only walk-in sets carry | **no change, by decision.** It is the rendering `main` already had (the qualifier is withheld precisely because "at venue" would be false for the row's online half), the per-tile truth is unaffected — those sets keep the #701 hatch and the "walk-in only — book at the venue" accessible name — and a mixed row that has any words of its own still gets them (`€25–€30 · Back`). Inventing a "some at venue" state would add copy and a fourth qualifier branch for a layout the editor permits but no venue has painted; if one ever does, that is its own slice |
| F-3 | review gate (nit) | Plan AC-6 quoted the pinned tile name ending `…, €45, available`; the shipped assertion ends `…, €45, taken` (A1 is the fixture's taken seat) | fixed-in-`this commit` — doc text only |
| F-0 | local e2e run (phase 2) | `customer-password.e2e.ts` + `operator-venue.e2e.ts` failed in the sandbox's full-suite run; both are sign-in-heavy flows this diff does not touch (no operator or auth file changed, and the shared cap only bounds a rail cell's width) | **not a defect** — both green in isolation (10 passed, 40s) against this same HEAD; the sandbox's 9.4-minute single-worker full run is the variable, not the diff. CI on PR #722 re-runs the same suite |

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

- [x] **Step 1: Write the failing test** — every branch of the priority: walk-in channel,
      descriptive label, positional-only + premium, positional-only + standard, mixed-price
      span composition, and the R-3 shapes (`AA`, `Row 12`, `VIP`).
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/venue/row-price-label.spec.ts"`
      → FAIL (module not found).
- [x] **Step 3: Minimal implementation** — `rowPriceLabel(sets)` returning
      `price` or `price · qualifier`, with `POSITIONAL_SEGMENT` anchored per R-3.
- [x] **Step 4: Run it, verify it passes** — same command → PASS (7 cases).
- [x] **Step 5: Generalization-audit pass** — logged below; tourist producer only.
- [x] **Step 6: Commit** — `git commit -m "Compose the tourist map's rail chip from price + row meaning (#702)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Wire it into the tourist map

**Files:** Modify `frontend/src/app/venue/venue-map.ts` · Test
`frontend/src/app/venue/venue-map.spec.ts`

- [x] **Step 1: Write the failing tests** — the enriched per-zone chip list, the walk-in
      zone split (chips + `mt-3` on all three columns), the updated #689 span pin, and the
      unchanged-tile-name pin (AC-6).
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/venue/venue-map.spec.ts"`
      → 3 failed: the three chip lists, each still bare prices (the walk-in row rendering
      **no** chip at all in the equal-price case — the behaviour AC-4 exists for).
- [x] **Step 3: Minimal implementation** — `rows` maps each row's sets through
      `rowPriceLabel`; `zoneStart` compares the composed labels (the #689 rule, unchanged).
- [x] **Step 4: Run it, verify it passes** — same command → 59 passed; then
      `--include="src/app/venue/**/*.spec.ts" --include="src/app/operator/**/*.spec.ts"`
      → 508 passed, no operator spec edited (AC-8's first half).
- [x] **Step 5: Generalization-audit pass** — logged below.
- [x] **Step 6: Commit** — `git commit -m "Split zones by chip meaning, not price alone (#702)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — Rail truncation cap + e2e pins

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.html`,
`frontend/src/app/shared/beach-map-canvas.ts` · Test `frontend/e2e/venue-map-pan.e2e.ts`

- [x] **Step 1: Write the failing test** — the 390 px spec (two over-cap labels, per the
      restated AC-7), axe clean; plus the updated 5-chip pin on the wide venue.
- [x] **Step 2: Run it, verify it fails** —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts venue-map-pan`
      → 1 failed: the rail measured **170 px** at 390 px wide, which is the regression this
      phase exists to prevent; the other 10 (incl. the new 5-chip pin) passed.
- [x] **Step 3: Minimal implementation** — `max-w-[92px] sm:max-w-[128px]` on the rail cell,
      `min-w-0 max-w-full truncate` on the chip; the canvas's `priceLabel` contract doc now
      states the cap, so a caller knows it may pass a phrase.
- [x] **Step 4: Run it, verify it passes** — same command → 11 passed; then the full unit
      suite (1508 passed) and the full mocked e2e suite (227 passed; two specs unrelated to
      this diff — `customer-password.e2e.ts`, `operator-venue.e2e.ts` — failed in the sandbox
      and passed on an isolated re-run against the same HEAD, see F-0).
- [x] **Step 5: Generalization-audit pass** — logged below.
- [x] **Step 6: Commit** — `git commit -m "Cap the price rail so a long row label never costs tile width (#702)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | review F-1 — an English literal was deciding what venue-authored text means | every frontend site that **parses** a venue-authored `rowLabel` (as opposed to rendering or grouping by it), enumerated from the field rather than from "the map files" | `grep -rn "rowLabel" frontend/src --include=*.ts \| grep -v spec` | 1 parser — `venue/row-price-label.ts`; the other 30 sites render it verbatim (booking dialog, confirmations, my-bookings, operator labels) or key a map by it (`shared/availability-grid.ts`, `venue-map.ts`), and are language-agnostic already | the parser only. Worth stating: the fix's value is that the **only** place that reads meaning out of venue prose no longer assumes English — the verbatim renderers never did |
| 2026-08-20 | phase 2 — an unbounded venue-authored string now reaches shared chrome | every element in the shared canvas that renders caller-supplied text (rather than a value the canvas itself derives), enumerated from the row contract's fields, not from "the rail" | `grep -n "row\.\|{{" frontend/src/app/shared/beach-map-canvas.html` | 2 — `row.priceLabel` (now a phrase) and `row.code` (the canvas's own `A`/`B`, bounded by `rowCode`); the projected tile row is the surface's own template, not the canvas's | capped `priceLabel` only. `row.code` needs no cap: every producer derives it (`rowCode`, `gridRowLabel`) rather than passing venue text through, so it cannot exceed two characters — noted so the asymmetry reads as a decision, not an oversight |
| 2026-08-20 | phase 1 — zones now partition on a richer label | every surface that derives `zoneStart` from a comparison (rather than hard-coding `true`), enumerated by the field, not by "the price-zone ones" | `grep -rn "zoneStart" frontend/src --include=*.ts --include=*.html` | 2 comparers — `venue/venue-map.ts` (now on the composed label) and `operator/daily-view-tab.ts` (still `prices[i] !== prices[i-1]`); `set-editor.ts` + `layout-editor.ts` hard-code `true` with a stated reason | tourist comparer only. The Daily view is the same *mechanism* but a different audience: it is a staff surface whose cells already carry pool + state per tile, its rail is deliberately bare prices (the issue's fence), and splitting its zones would be an unasked-for visual change to an operator tool. Recorded rather than silently skipped |
| 2026-08-20 | phase 0 — a new rule for what a rail chip says | every producer of a `BeachMapCanvasRow.priceLabel` (the string the shared rail renders), enumerated by the field name rather than by "the map-ish components" | `grep -rn "priceLabel" frontend/src --include=*.ts --include=*.html` | 4 producers — `venue/venue-map.ts` (tourist rows), `operator/set-editor.ts`, `operator/layout-editor.ts`, `operator/daily-view-tab.ts` — plus 2 same-named fields that are **not** rail chips (`VenueMap.venueView.priceLabel` and `pages/home`'s card "from €X") | tourist producer only. The three operator producers keep bare prices by the issue's explicit fence, and it reads correctly there: those surfaces paint tier/pool per cell and their operator already knows the layout. The two same-named venue-level fields are out of population — noted so a later reader does not "fix" them for symmetry |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6:** `npx ng test --watch=false --include="src/app/venue/**/*.spec.ts"` →
      114 passed at `8897d96`; the whole unit suite (1514) is green in CI on the same head.
- [x] **AC-7, AC-9:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
      --config playwright.a11y.config.ts venue-map-pan` → 11 passed, axe included.
- [x] **AC-8:** the operator specs pass untouched, and
      `git diff --stat origin/main -- frontend/src/app/operator` is empty.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
