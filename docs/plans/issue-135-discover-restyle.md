# Discover Restyle (T2) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Discover page (`pages/home`) renders per the Liquid Glass design in both
themes — hero chip + display headline, one glass filter bar with the live result count
and date label inside it, a responsive grid of glass venue cards (gradient photo area
with mode chip + location overlay, name, rating, a T7 chip slot, a thin availability
bar, price + free-count footer) — with behavior parity (same service calls, same
`data-testid`s, same aria-live announcements) and the `''` route off the compat surface.

**Architecture:** Pure restyle of `pages/home` consuming the T1 token layer. New
card-surface tokens land in `styles.scss` (per-theme, so T3–T5 reuse them); component
logic gains only presentation helpers (`freePercent`, always-visible result count). No
service/model changes — `GET /api/venues` already carries everything.

**Persistence:** N/A — frontend-only slice, no backend/tables touched (invariant #1 unaffected).

**Source of intent:** issue #135 (epic #133); design
`docs/design/riviera-sunbeds-liquid-glass-v2.dc.html` → `Discover` screen (lines
121–195); intake note `docs/design/2026-07-02-liquid-glass-redesign-note.md`; T1
close-out notes on #133 (legacySurface flip, substrate patch riding this PR).

**Skills consulted:** `riviera-frontend` (restyle stays in `pages/home`; tokens →
`styles.scss`; e2e in the CI-safe mocked suite; substrate patch scoped to this skill),
`angular-developer` + angular-cli MCP `get_best_practices` (Angular 22: signals,
`computed`, native control flow, class/style bindings, axe/WCAG-AA mandatory),
`playwright-cli` (loaded at the e2e phase — spec adjustments), `riviera-local-debug`
(loaded before the first `npm` run of the session).

**Branch:** `claude/discover-liquid-glass-t2-pc0luy` — the session's designated remote
branch stands in for `feature/discover-restyle` (cloud-session addendum).

---

## Issue-intake grill outcome (gate run 2026-07-02)

- Issue ACs verified against current `home.ts`/`home.html` and the design file — all
  still correct. No open PRs; no Flyway in scope; no branch overlap.
- `app.spec.ts:103` pins **every** route carrying `legacySurface: true`; T2 flips `''`
  off the flag, so that spec becomes "every route **except `''`**" (the spec's own
  comment anticipates the per-slice flip).
- Design detail confirmed: the result count lives **inside the filter bar** and stays
  visible whenever a list has loaded — **including the empty state** (`0 venues · date`).
  Today the count renders only when non-empty; adopting the design is a deliberate
  behavior delta (still `aria-live`, same testid).
- Copy deltas adopted from the design: hero chip `Sunbeds by the sea`; headline copy
  unchanged (`Find your spot on the Riviera.` — trailing period added per design); intro
  `…straight from the venue's map — front row to promenade.`; empty state drops the
  inline date (the always-visible bar count carries it). Error state has no design
  visual → copy kept, surface restyled. Date label keeps the existing year-including
  format (`Tue 30 Jun 2026`) — the design demo's year-less format is demo formatting,
  not an intentional copy change; parity wins.
- AA reality check (the design's fixed alphas fail composited math — same class of
  finding as T1's header): see R-1/R-2 below.

## Acceptance criteria (testable)

- [ ] **AC-1:** Given venues load, when Discover renders (each of the two themes), then
  the hero (chip + headline + intro), one glass filter bar (Beach/Region/Date + count
  block inside), and a card grid render per design, and cards lift on hover only on
  pointer devices (`@media (hover: hover)`). *Pinned by:* `home.spec.ts` (structure),
  `home.scss` hover media query (review-checked), `theme-shell.e2e.ts` axe sweeps
  (both themes, real render).
- [ ] **AC-2:** Given a loaded list (including an empty one), when the count block
  renders inside the filter bar, then it shows `N`, the pluralized noun, and the
  formatted date, and is announced via `aria-live="polite"` under the existing
  `data-testid="results"`. *Pinned by:* `home.spec.ts` (count + empty-state presence),
  `discovery-flow.e2e.ts`.
- [ ] **AC-3:** Given a venue with `fromPrice` in minor units and `ratingTenths`, when a
  card renders, then price comes from `shared/money.ts` (invariant #5) and rating from
  tenths with no float math on the wire (`(tenths/10).toFixed(1)`). *Pinned by:*
  `home.spec.ts` (€25 / 4.8 assertions, unchanged).
- [ ] **AC-4:** Given `availability {free, total}`, when the availability bar renders,
  then its fill width is `round(free/total*100)%` and a `total = 0` venue renders 0%
  (no division by zero). *Pinned by:* `home.spec.ts` (new width + zero-set cases).
- [ ] **AC-5:** Given the existing e2e/unit suites, when T2 lands, then all preserved
  `data-testid`s (`filter-beach`, `filter-region`, `filter-date`, `results`, `empty`,
  `error`, `venue-card`, `card-availability`, `loading`) still resolve and
  `discovery-flow.e2e.ts` is green (adjusted only for intentional copy changes).
  *Pinned by:* CI + the e2e suite.
- [ ] **AC-6:** Given each theme, when Discover renders any state (list/loading/empty/
  error), then axe finds no serious/critical violations and every text-bearing
  colour pair meets WCAG AA **as a composited effective colour over the worst-case
  gradient stops** (the T1 `app.contrast.spec.ts` pattern); cards remain real links
  with the single full-fact `aria-label`. *Pinned by:* `home.a11y.spec.ts`,
  `home.contrast.spec.ts` (rewritten to composited pairs), e2e axe sweeps.
- [ ] **AC-7:** Given the `''` route, when T2 lands, then `legacySurface` is removed
  (Discover renders on the bare themed background) and every *other* route still
  carries the flag. *Pinned by:* `app.spec.ts` (adjusted route-flag spec).

## Non-goals

- Amenity + distance-to-water chip **content** — T7 (#140). T2 renders the chip-row
  layout slot with nothing in it (no placeholder text).
- Venue photos (#142) — the photo area stays the design's gradient + sun disc.
- Beach map/booking/other pages (T3–T5), nav "My bookings" (T6), extra palettes (#143).
- No change to `VenueService`, models, or query behavior (last-writer-wins guard stays).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | White hero/state text over the bare riviera gradient cannot clear AA (large-text 3:1 fails even over the mid stop; T1 already hit this class on the header) | certain (math) | high | hero + list-state panels sit on the **already-proven** `--riv-header-glass`/`--riv-header-border` tokens (dark glass in riviera, white glass in porcelain) — reusing the exact ink pairs `app.contrast.spec.ts` validates; recorded design deviation like T1's header | agent | resolved 4f3a67b (panels shipped; pinned by home.contrast.spec.ts) |
| R-2 | The design's fixed light-glass alphas (bar/cards white 0.55, muted ink 0.55–0.7, teal #0a6e85) fail composited AA over riviera's darkest stop | certain (math) | high | per-theme `--riv-card-glass` (riviera alpha raised, porcelain per design), muted-ink/accent alphas tuned until `home.contrast.spec.ts` (composited pairs) is green; each deviation annotated in `styles.scss` | agent | resolved 30f3f5e (riviera 0.78, inks 0.78/0.72, accent #085a6e, dark field border) |
| R-3 | Restyle breaks existing e2e/unit pins (testids, copy, aria-label) | med | med | testids preserved verbatim; copy changes limited to the grill-listed deltas; full FE unit + mocked e2e run locally before push | agent | resolved daa377e (unit 262/262, mocked e2e 17/17, lint clean) |
| R-4 | `results` now visible in the empty state changes AT announcements unexpectedly | low | low | still one `aria-live="polite"` region with meaningful text ("0 venues …"); empty message keeps its own testid/live region | agent | resolved daa377e (axe clean in all four states; &ngsp; keeps the announcement text spaced) |
| R-5 | Availability-bar division by zero (0-set venue) renders `NaN%` | med | low | `freePercent` guards `total === 0` → 0; unit-pinned (AC-4) | agent | resolved 4f3a67b |
| R-6 | Hover lift on touch devices causes sticky-hover artifacts | low | low | lift under `@media (hover: hover)` only (AC-1) | agent | resolved 4f3a67b |

## Open questions / Assumptions

### Resolved

- **Assumption (decide-myself, recorded, kept):** date label keeps the year (parity with
  today); design demo omits it — treated as demo formatting. Shipped in 4f3a67b.
- **Assumption (recorded, kept):** hero/state glass panels are a deliberate AA deviation
  from the design's open-air text, following T1's header precedent; noted in
  `styles.scss`/`home.scss` and the PR body for the maintainer to veto. Shipped in 4f3a67b.

## Availability & concurrency (invariant #2)

N/A — read-only presentation of the availability summary the API already returns; no
booking/claim path is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. (Module-ownership: all in `pages/home` + the token layer; no
boundary change.)

## Payment & payout (invariants #5, #8, #9, #10)

No money *moves*; display only. `from €X / set` renders integer minor units via the
existing `shared/money.ts` (invariant #5) — no new float math.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `styles.scss` | modified | token layer | new per-theme card-surface tokens: `--riv-card-glass/-border/-ink/-ink-soft/-ink-mute`, `--riv-accent-ink`, `--riv-photo-grad`, `--riv-card-track` | — |
| FE-2 | `pages/home/home.ts` | modified | page component | adds `freePercent(venue)`; count/date logic unchanged (signals/computed as today) | native selects/date input unchanged (no Signal Forms needed — no form model) |
| FE-3 | `pages/home/home.html` + `home.scss` | rewritten | template/styles | hero panel, glass filter bar with count block, glass cards (photo area, chip slot, availability bar) | — |
| FE-4 | `pages/home/home.spec.ts` / `home.a11y.spec.ts` / `home.contrast.spec.ts` | modified | unit + axe + composited-contrast specs | contrast spec rewritten to the T1 composited-pair pattern | — |
| FE-5 | `app.routes.ts` + `app.spec.ts` | modified | route data | `''` loses `legacySurface`; route-flag spec asserts the exception | — |
| FE-6 | `e2e/discovery-flow.e2e.ts` | adjusted | CI-safe mocked e2e | copy-only adjustments + count-in-bar assertion; axe steps unchanged | — |

**Standards:** standalone, `inject()`, signals, native control flow, class/style
bindings (no `ngClass`/`ngStyle`), axe + WCAG AA per the loaded best-practices guide.
Cards stay real `<a routerLink>` links with the single full-fact `aria-label`
(inner spans `aria-hidden`) — the design's `div onClick` is demo logic.

## FE↔BE contract

N/A — no contract change (`GET /api/venues` summary consumed as-is).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Card-surface tokens + composited contrast spec | ✅ | 30f3f5e |
| 1 — Component restyle (template/styles/logic) + route flag flip | ✅ | 4f3a67b |
| 2 — e2e adjustments + full local FE suite | ✅ | daa377e |
| 3 — Substrate patch (`riviera-frontend` skill) + plan final state | ✅ | 967018e |
| 4 — Review-gate fix round (scrim geometry, vacuous count pins, chip-slot gap, token literals, spec/token dedup) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## Phase 0 — Tokens + contrast spec (red → green)

Rewrite `home.contrast.spec.ts` first to the composited-pair pattern
(`testing/contrast.ts` helpers): every text-bearing pair of the new design — hero
inks over `--riv-header-glass` over each theme's worst-case stops (reusing the T1
pairs), card/bar inks + accent over `--riv-card-glass` over the stops, mode-chip ink
over the chip glass over the photo-gradient stops, location overlay (white) over the
scrim over the photo gradient. Red (tokens absent / design alphas fail) → add the
token blocks to `styles.scss` with tuned alphas → green. The availability-bar track
and fill are redundant non-text decoration (the `N of M free` text carries the fact) —
exempt from 1.4.11, noted in the spec header.
Scope: `npm test -- --include='**/home.contrast.spec.ts'`. Commit.

## Phase 1 — Component restyle

Failing unit specs first (`home.spec.ts` additions/changes): count block inside the
bar (`results` testid, present in the empty state, pluralization), availability-bar
width `round(free/total*100)` + zero-total guard, chip-row slot renders no text,
hero copy, unchanged pins (money/rating/labels/links). Adjust `app.spec.ts`
route-flag spec (red) → rewrite `home.html`/`home.scss`, add `freePercent` to
`home.ts`, drop `legacySurface` from `''` in `app.routes.ts` → green.
`home.a11y.spec.ts`: same four states, axe clean.
Scope: `npm test -- --include='**/home*.spec.ts' --include='**/app*.spec.ts'`. Commit.

## Phase 2 — e2e

Load `playwright-cli`. Adjust `discovery-flow.e2e.ts` for intentional copy changes
only; add the count-in-bar assertion ("2 venues"); keep the axe steps (they now audit
the glass render; theme-shell already sweeps `/` in both themes and after the animated
theme-picker settles). Run the full FE unit suite + `npm run lint` +
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` locally.
Commit; push; **check the push's CI run before Phase 3**.

## Phase 3 — Substrate patch + close-out prep

Patch `.claude/skills/riviera-frontend/SKILL.md`: theme/token infra (`core/theme.ts`
registry + `styles.scss` `--riv-*` tokens under `data-riv-theme`; components consume
tokens, never literals) and the shared e2e axe helper (`e2e/support/axe.ts`) —
recorded on epic #133 as riding this PR. Plan-doc final state; push; PR; gates.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-02 | Phase 2: compiler whitespace-stripping glued `<strong>1</strong>` to "venue" → "1venue" in text content (e2e catch) | other adjacent inline elements whose combined text AT/assertions read | `grep -n "</strong>$" src/app/**/*.html` (manual scan of multi-element text runs) | only the new count block; existing templates keep separators inside one element or use literal `·`/text nodes | `&ngsp;` after the count; rule noted: text split across sibling inline elements needs an explicit space |

---

## Review-gate record (riviera-review-overlay + code-review, high effort, on PR #145)

8 finder angles → 30 candidates → dedup → 3 verifier agents on the numerically uncertain
ones (rest confirmed by direct inspection). **Fixed in the fix-round commit:**
(1) **scrim geometry** (CONFIRMED, 4 independent finders): the location-overlay contrast
guard assumed scrim alpha ≥ 0.5 under the text; actual band was 0.35–0.47 (white over the
light photo stop = 4.26:1 < AA) — scrim token gains a 0.5 @75% stop, `.photo-location`
gets an explicit 15px line box, spec asserts the now-true 0.5 floor with the geometry
documented; (2) **vacuous count assertions** (CONFIRMED): `'2'`/`'0'` substring pins were
satisfied by the year "2026" — unit specs assert `.count-number` exactly, e2e asserts
`'2 venues'`/`'0 venues'`; (3) **chip-slot gap** (CONFIRMED): the empty T7 slot cost an
extra 8px flex gap → `:empty { display: none }`; (4) **bar-count jump** (CONFIRMED by
real-render measurement, 53px vs 51px reserved) → explicit `line-height: 14px` +
`min-height: 53px` (deterministic sum); (5) **hero-chip pair** (PLAUSIBLE, riviera worst
case 4.53:1 = thinnest on the page) added to the home spec per theme; (6) **porcelain
token-block duplication** → porcelain now overrides only `--riv-card-glass`;
(7) **contrast-fixture duplication** → shared `testing/glass-tokens.ts` (token mirrors +
`expectAaOverStops`), both specs refactored onto it; (8) **palette literals** → new
`--riv-field-fill`/`--riv-photo-ink` tokens, focus halo via `color-mix` on
`--riv-accent-ink`, mode-chip border on `--riv-card-border`; (9) **glass-recipe
duplication** → `%panel-glass`/`%card-glass` placeholders in home.scss.
**Declined with rationale:** axe-incomplete on glass surfaces (T1-established
architecture; the composited unit specs are the compensating net); deleting the T7 chip
slot (the issue's AC mandates it); scrim-as-multi-background (changes the sun/scrim paint
order the design specifies; #142 restructures the photo area anyway); per-card
`backdrop-filter` cost (the design language mandates card glass; blur is genuinely
visible over the animated background — revisit with #142 real-photo work if profiling
shows jank); mode-chip blur being a no-op over the flat gradient (becomes functional
with #142 photos; negligible cost); a `--riv-panel-glass` alias (the hero/state coupling
to the header-glass tokens is deliberate — it is what makes the T1-proven AA pairs apply);
a global glass-utility partial (rule of three — extract at T3 when a second page consumes
it; noted on epic #133 at close-out).
Overlay walk: RV-BE-1 / RV-CT-3 / RV-BE-9 / RV-BE-3c/10/11/12 all N/A (frontend-only,
read-only display, no venue-scoped surface); RV-FE-* pass; RV-FE-E2E pass (CI-safe suite,
shared axe policy); RV-PROC-1 pass (Skills consulted covers FE + e2e; re-walked for the
fix round — all fixes are frontend, skills already loaded).
Post-fix verification: unit 264/264, lint clean, `discovery-flow` + `theme-shell` e2e 6/6.

## Acceptance-criteria verification (final)

- [x] **AC-1** design render both themes + pointer-only hover: home.spec structure pins,
  hover `@media (hover: hover)`, theme-shell e2e axe sweeps both themes; screenshots
  verified during Phase 2 (desktop riviera/porcelain + mobile).
- [x] **AC-2** count + noun + date in the bar, aria-live, visible when empty: home.spec
  (exact `.count-number` pins), discovery-flow e2e.
- [x] **AC-3** money via shared/money.ts, rating from tenths: home.spec €25 / 4.8 pins.
- [x] **AC-4** bar width round(free/total*100), zero-set → 0%: home.spec 75%/50%/0% pins.
- [x] **AC-5** testids preserved, discovery-flow green: e2e 17/17 locally + CI.
- [x] **AC-6** axe + composited AA both themes, cards real links with full aria-label:
  home.a11y.spec, home.contrast.spec (incl. scrim-geometry + hero-chip pins), e2e sweeps.
- [x] **AC-7** `''` off legacySurface, others still flagged: app.spec route-flag spec.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] No JPA / no backend change (invariant #1 trivially holds).
- [x] Availability/Modulith/Payment sections justified N/A (frontend-only).
- [x] Frontend standards met; no `as any`.
- [x] Execution-status table at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with issue #.
