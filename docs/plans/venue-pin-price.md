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
| R-1 | The wider pill shrinks below 44 px on one axis (a `min-w` without a height, or vice versa) | low | high | `h-11 min-w-11` on the pill; the e2e touch-target sweep measures every pin box in the map-open tests | session | closed — `discover-map.e2e.ts` measures height ≥ 44 and width > height; 19/19 green locally and in CI |
| R-2 | `MapPin` leaks venue/money vocabulary | low | med | the field is `badge: string` — text on a face; the consumer composes it and the "from" wording | session | closed — review gate (RV-FE-8 and the `MapPin` doc walk) found no leak |
| R-3 | A price change rebuilds the pin set and drops focus | low | low | it already rebuilds on a label change today; a reprice comes from the date field, which holds focus, never a pin | session | closed — see F-1: every reload empties `venues` first, so the rebuild predates this slice |
| R-4 | 14 px bold ink fails AA on the fill or its inversion | low | med | the `--riv-solid-btn-ink`/`-fill` pair is AA-proven both ways (`solid-btn-tokens.contrast.spec.ts`); the pin adds no new colour | session | closed — no new colour position; Sonar reports 0 new issues |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the no-price fallback is the plain dot, not a "—" pill. — *Outcome:* kept;
  the review gate raised no objection and the PR's Scope notes record the choice (PR #1137).

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

**Stage pointer:** DONE — merged via PR #1137 (CI green, review gate run, Sonar gate green with an
empty list); the merge close-out (`references/pr-gates.md` §3) retires this doc.

**Next action:** none — after the merge, verify #1135 closed and retire this plan at the next close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — price on the pin face + name, dot fallback | ✅ | merged via PR #1137 |

**Review note:** the gate ran in full — `code-review:code-review` (rung 1) at medium effort with
`riviera-review-overlay` layered on, over `5c1c981e..b434d734` (7 files, +338/−27, verified by
`check-review-range.mjs`). Five reviewers; two candidate findings, both rejected below the bar
(F-1, F-2). Posted on the PR.

**Sonar note:** `SonarCloud Code Analysis` concluded `success`; the API list for
`pullRequest=1137` is empty (`total: 0`) and the measures are real — `new_lines` 42, new
coverage 100.0 %, new duplication 0.0 %, 0 hotspots — so the zero is analysed, not unanalysed.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (git-history reviewer) | folding `badge` into the rebuild key tears every pin down on a reprice and drops focus | rejected (scored 40) — pre-existing: `Home.beginRequest()` sets `venues` to `undefined` before every list request, so a date change already rebuilt every pin at the base commit, with focus on the date field, never a pin; the key already carried `label` |
| F-2 | review (prior-PR-comments reviewer) | the wider pill makes the open #1134 overlap more visible | rejected (scored 0) — a documented non-goal; #1134 stays its own slice |

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

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1) — no backend change.
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2) — N/A, justified.
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11) — N/A, frontend-only.
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9) — N/A; display only, from minor units.
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — untouched.
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12) — no schema change.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #1137`. The close-out is a second, docs-only commit: the review and Sonar outcomes it records could only exist after the first push, and no code fix was needed to carry it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
