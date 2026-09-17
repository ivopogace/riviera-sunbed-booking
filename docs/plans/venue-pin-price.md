# Venue pin from-price Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every venue pin on Discover's riviera map shows the venue's from-price for the selected
date on its face (`€25`), announces it in its accessible name, and falls back to the plain dot
when the venue has no priced set — with no backend or API change.

**Architecture:** `MapPin` gains one optional map-vocabulary field, `badge` — short text the pin
shows on its face — so the map stays ignorant of money and venues; `venuePins()` fills it from
`VenueCard.priceLabel` and folds the price into the pin's `label`, so the accessible name carries
the fact the pill shows. The pin element grows from a fixed 44 px disc into a 44 px-high pill that
widens with its text; a pin with no badge keeps today's disc.

**Persistence:** JDBC only (invariant #1). No table or migration touched — frontend-only.

**Source of intent:** GitHub issue #1135 (sibling #1134, overlapping pins, stays open).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — issue's code
citations re-verified against `main`; #1134 open with no PR in flight, only a Dependabot PR open,
no overlap) · `riviera-plan-doc` (this template — forced the seam per AC and the no-price
fallback decision) · `tdd` (each AC red at its seam before the map or the builder changed) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(`N/A — no substrate doc states the pin face; RESPONSIBILITIES/ADR untouched`) ·
`riviera-frontend` (`MapPin` stays in `shared/`, the venue meaning stays in `pages/home/`) ·
`riviera-tailwind` (the pill keeps the theme-invariant `--riv-solid-btn-*` skin, the 44 px
floor on both axes via `h-11 min-w-11`, `text-[14px]` not `text-sm`, `tabular-nums`) ·
`angular-developer` + angular-cli MCP (v22 best practices: signals/effects untouched, a11y
mandatory) · `frontend-design` (spend the boldness on the one fact — the price — and keep the
rest of the chrome as it is; the no-price venue is a quiet dot, not an empty pill) ·
`playwright-cli` (the mocked `discover-map.e2e.ts` pins the visible price and the measured box)
· `riviera-local-debug` (scoped Vitest via `--include`, mocked e2e with the pre-installed
Chromium).

**Branch:** `claude/sdlc-1135-tailwind-angular-design-2l7ayf` (the session's designated remote
branch stands in for `feature/venue-pin-price`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `VenueCard` with a location and `priceLabel` `€25`, when the pins are
  built, then its pin carries `badge: '€25'` and `label: 'Miramar Beach Club, from €25'`.
  *Seam:* `venuePins(cards)` → `MapPin[]` · *Pinned by:* `venue-pins.spec.ts` "carries the
  from-price onto the pin's face and into its name".
- [ ] **AC-2:** Given a located `VenueCard` with `priceLabel: null`, when the pins are built,
  then its pin has no `badge` and its label is the venue name alone. *Seam:* `venuePins(cards)`
  · *Pinned by:* `venue-pins.spec.ts` "draws a plain pin for a venue with no priced set".
- [ ] **AC-3:** Given a `MapPin` with a `badge`, when the map draws it, then the button's
  visible text is the badge, its accessible name is the label, and it still flips
  `aria-expanded` on selection. *Seam:* `RivieraMap.pins` input → the rendered
  `[data-testid="map-venue-pin"]` buttons · *Pinned by:* `riviera-map.spec.ts` "shows a pin's
  badge on its face and keeps its name for assistive tech".
- [ ] **AC-4:** Given a `MapPin` without a `badge`, when the map draws it, then the button shows
  the `●` glyph as before. *Seam:* as AC-3 · *Pinned by:* `riviera-map.spec.ts` "draws a plain
  dot for a pin with nothing to say".
- [ ] **AC-5:** Given a drawn pin whose `badge` changes (a new date reprices it), when the pins
  are re-fed, then the face shows the new badge. *Seam:* as AC-3 · *Pinned by:*
  `riviera-map.spec.ts` "redraws a pin whose badge changed".
- [ ] **AC-6:** Given Discover with two pinned venues at €25 and €30, when the map is shown,
  then each pin reads its price, its accessible name is `<name>, from <price>`, and every pin's
  rendered box is ≥ 44 px on both axes. *Seam:* the mocked Discover page,
  `discover-map.e2e.ts` · *Pinned by:* "draws a pin per pinned venue…" (extended) +
  `expectTouchTargets` in the existing map-open tests.

## Non-goals

- Any backend or API change (`fromPrice` is already in `VenueSummary`).
- Price on the operator console's placement pin (`pin`/`pinLabel`).
- Collision handling for overlapping pins — #1134, its own slice.
- Re-formatting the price: the pin shows exactly `VenueCard.priceLabel` (`formatMoney`, which
  already drops the cents of a whole amount), so the three surfaces cannot disagree.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — the pin face changes, no surface is retired. The dot survives as the no-badge case.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The wider pill shrinks below 44 px on one axis (a `min-w` without a height, or vice versa) | low | high | `h-11 min-w-11` on the pill; the e2e touch-target sweep measures every pin box in the map-open tests | session | open |
| R-2 | `MapPin` leaks venue/money vocabulary | low | med | the field is `badge: string` — text on a face; the consumer composes it and the "from" wording | session | open |
| R-3 | A price change rebuilds the pin set and drops focus | low | low | it already rebuilds on a label change today; a reprice comes from the date field, which holds focus, never a pin | session | open |
| R-4 | 14 px bold ink fails AA on the fill or its inversion | low | med | the `--riv-solid-btn-ink`/`-fill` pair is AA-proven both ways (`solid-btn-tokens.contrast.spec.ts`); the pin adds no new colour | session | open |

## Open questions / Assumptions

- **Assumption:** the no-price fallback is the plain dot, not a "—" pill — a venue with
  nothing to sell says nothing, which the issue's "sensible fallback" allows. — *Owner:*
  session · *Resolves by:* the review gate.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the price shown is the list's already-computed
availability-aware from-price; no write path is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Money is displayed from the wire's integer minor units via
`formatMoney`, never computed here.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/riviera-map.ts` (`MapPin.badge`, the pin face) | existing | standalone component | existing `effect` on `pins` | none |
| FE-2 | `pages/home/venue-pins.ts` | existing | pure function | none | none |

**Standards:** no deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR — draft open, merging latest `main` then ready-for-review; review gate due.

**Next action:** run the review gate (`references/pr-gates.md` §1) over the PR's resolved range.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — price on the pin face + name, dot fallback | ✅ | the PR's first commit (#1135) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/venue-pin-price.md` — this plan
- `frontend/src/app/shared/riviera-map.ts` — `MapPin.badge`; the pill/dot pin face
- `frontend/src/app/shared/riviera-map.spec.ts` — AC-3/4/5
- `frontend/src/app/pages/home/venue-pins.ts` — badge + label from `VenueCard`
- `frontend/src/app/pages/home/venue-pins.spec.ts` — AC-1/2
- `frontend/src/app/pages/home/home.spec.ts` — pin-name assertions follow the new label
- `frontend/e2e/discover-map.e2e.ts` — AC-6

---

## Phase 0 — price on the pin face

**Files:** Modify `frontend/src/app/shared/riviera-map.ts`, `frontend/src/app/pages/home/venue-pins.ts` · Test the three spec files + the e2e above.

- [x] **Step 1: Write the failing tests** — AC-1/2 in `venue-pins.spec.ts`, AC-3/4/5 in `riviera-map.spec.ts`.
- [x] **Step 2: Run them, verify they fail** — `npx ng test --watch=false --include="src/app/pages/home/venue-pins.spec.ts" --include="src/app/shared/riviera-map.spec.ts"` → FAIL (`TS2339: Property 'badge' does not exist on type 'MapPin'`).
- [x] **Step 3: Minimal implementation** — `MapPin.badge?: string`; `buildVenuePinElement` renders the badge text in a pill or the dot; the rebuild key includes the badge; `venuePins` fills badge + label.
- [x] **Step 4: Run them, verify they pass** — 52 passed; then the four touched spec files (125 passed) and the mocked `discover-map.e2e.ts` (19 passed, touch-target sweeps included).
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit** — `Riviera map: show each venue's from-price on its pin (#1135)`.
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-17 | phase 0 (a new optional `MapPin` field) | every builder of a `MapPin` and every reader of `pin.label` on the map | `grep -rn "MapPin\b" frontend/src --include=*.ts` | `venue-pins.ts` (builds), `riviera-map.ts` (draws), their specs | one builder, one drawer — both changed here; the operator console binds the single placement `pin`, which is a `LngLat`, not a `MapPin` |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..5:** scoped Vitest run above → 52 passed (phase 0 commit).
- [x] **AC-6:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium ./node_modules/.bin/playwright test --config playwright.a11y.config.ts discover-map.e2e.ts` → 19 passed (phase 0 commit).

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
