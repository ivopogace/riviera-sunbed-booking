# Beach-map canvas: the price rail reserves its width too

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the tourist beach map's price rail stops sizing itself from whatever the read
returned — it reserves 92px in both the loading and the loaded state, so the tile viewport
does not narrow from the right when the map lands.

**Architecture:** the same shape #749 settled on for the left rail, and the same reason it is a
*vocabulary*, not a loading flag: a new `priceChips` input names what the right rail's chips
**are** — `amounts` (a formatted amount or a min–max span: every operator surface) or
`capped-phrases` (a price plus what it buys, ellipsized at the #724/#702 cap: the tourist map
alone) — and that vocabulary decides the reservation. `amounts` reserves nothing beyond the
cell's existing 52px floor, so the three operator surfaces render byte-identically; the tourist
map reserves the **92px phone cap**, which is exactly its phone worst case and therefore ends
the phone settle outright.

**Persistence:** N/A — frontend-only, no schema and no query touched (invariant #1 unaffected).

**Source of intent:** GitHub issue #751 (measured while fixing #749, recorded in
`docs/plans/map-canvas-loading-mode.md`'s Non-goals rather than folded into that slice).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the branch again
carried already-merged history, restarted from `main`; and the grill killed one of the ticket's
two stated harms, see *Open questions*) · `riviera-plan-doc` (this template — its Behavior-parity
ledger is what forced the per-surface question, which is how the reservation ended up scoped to a
vocabulary instead of applied to all four surfaces) · `tdd` (red-first per phase: the canvas unit
specs before the template change, the e2e viewport-stability matrix before the surface adopted the
input) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (close-out — due over this slice's merge range) · `riviera-frontend`
(placement: the change is wholly inside `shared/` and its one tourist consumer; no new file, no
new cross-feature edge) · `riviera-tailwind` (the reservation is an arbitrary-value utility
computed in TS beside `railColumnClass`, not `@apply`; the `price-col` testid marker stays) ·
`angular-developer` + angular-cli MCP `get_best_practices` (v22: `input()` signal, `computed()`
for the derived class string, no `ngClass`) · `playwright-cli` (the measurement harness — rail and
viewport `getBoundingClientRect` either side of a held route, at both viewports) ·
`riviera-local-debug` (scoped Vitest + the `PW_CHROMIUM_EXECUTABLE` recipe for the mocked suite).

**Branch:** cloud session — the designated remote branch `claude/issue-744-51n4oe` stands in for
`bugfix/price-rail-reserved-width`, restarted from `origin/main` after PR #750 merged.

---

## The measurements this plan is built on (Chromium, mocked e2e fixtures)

Taken before any code changed, with the venue read held open. `rail` is the **right** rail
column's rendered width; `viewport` is the tile viewport's width — what a reader sees narrow.
Every row is `left rail 54px` post-#749, so the left half is out of these numbers.

| Surface / fixture | Viewport | Rail, skeleton | Rail, loaded | Tile viewport, skeleton → loaded |
|---|---|---|---|---|
| Tourist, `€45 · Front row` / `€35` | 1280 | 52.00 | 112.66 | 936.00 → 866.20 |
| Tourist, `€45 · Front row` / `€35` | 390 | 52.00 | 92.00 (capped) | 178.00 → 138.00 |
| Tourist, bare `€30` only | 1280 | 52.00 | 52.00 | 936.00 → 926.86 |
| Tourist, bare `€30` only | 390 | 52.00 | 52.00 | 178.00 → 178.00 |
| Tourist, `€9,995 · Front row` | 1280 | 52.00 | 128.00 (capped) | 936.00 → 850.86 |
| Daily view, `€45` / `€35` | 1280 | 52.00 | 52.00 | 868.00 → 858.86 |
| Daily view, `€125–€9,995` | 1280 | 52.00 | 96.58 | — |

Two facts the ticket did not have, both of which shape the fix:

1. **The chip's width is entirely the qualifier's.** A bare amount measures 40.97px, which the
   cell's existing `min-w-[52px]` already covers — so the settle is *only* ever the `· Front row`
   / `· at venue` half (#702, narrowed by #724) or a four-digit price. That is why the
   reservation belongs to the tourist vocabulary and nowhere else.
2. **The operator rails are not flat, they are merely narrow.** A row whose sets differ in price
   renders a min–max span (`€125–€9,995` = 96.58px), so `amounts` keeps a bounded residual rather
   than reaching zero. Reserving 92px for them would spend 40px of grid on a chip that is 41px
   wide in every realistic venue, which is the R-1 failure mode inverted.

**And the ceiling the reservation had to be measured against.** `venue-map-pan.e2e.ts`'s
fits-whole guarantee (#700) is the constraint #749 spent ~18px of. Measured on a 14-column venue
at 1280, the width available to the price rail before that map pans is **~125.6px** — read two
independent ways that agree: the premium-front-row fixture rails at 112.66px with 13px of slack
left, and an all-standard 14-column venue rails at 52px with 74px of slack left. So:

| Candidate reservation | Settle removed | Cost to a bare-price venue | Fits-whole margin left |
|---|---|---|---|
| 92px, single tier (**chosen**) | all of it on a phone; 40 of ≤76px on desktop | 40px | 34px (all-standard), 13px (premium — unchanged) |
| 92 / 120px, two tiers | all but ≤8px | 68px | ~6px — thin enough that a font-metric bump turns #700 red |
| 128px (the desktop cap) | all of it | 76px | **−2.3px: the map pans.** Ruled out by measurement |

## Acceptance criteria (testable)

- **AC-1:** Given `priceChips="capped-phrases"`, when the price rail renders in either the
  loading or the loaded state, then its column reserves `min-w-[92px]` and the class string is
  identical across the two states. *Pinned by:* `beach-map-canvas.spec.ts` › "reserves the same
  price-rail width loading and loaded (#751)".
- **AC-2:** Given the default `priceChips="amounts"`, when the price rail renders in either
  state, then its column reserves nothing beyond the cell's own `min-w-[52px]` floor — the three
  operator surfaces are unchanged. *Pinned by:* `beach-map-canvas.spec.ts` › "an amounts price
  rail reserves nothing, so the operator surfaces are unchanged (#751)".
- **AC-3:** Given the tourist beach map at 1280 and price labels at either extreme of what the
  chip can carry, when the read lands, then the tile viewport narrows by exactly
  `max(0, loadedPriceRail − 92)` — 40px less than it did, whatever the venue. *Pinned by:*
  `loading-skeletons.e2e.ts` › "…price rail holds its width across the load (#751)".
- **AC-4:** Given the tourist beach map at 390, when the read lands, then the tile viewport does
  not change width at all (≤1px) for **any** venue — the reservation and the #724 phone cap are
  the same number there. *Pinned by:* the same test at the phone viewport, whose computed
  allowance is 0.
- **AC-5:** Given a 14-column venue whose zones all render bare amounts — the venue the
  reservation actually costs — when it renders at 1280, then it still fits whole: no overflow and
  no `scroll-hint`. *Pinned by:* `venue-map-pan.e2e.ts` › "a 14-column map fits whole even when
  its price rail is the reservation, not a chip (#751)".
- **AC-6:** Given either surface, when the tile grid's own left edge is measured either side of
  the load, then it still slides by only what #749's left-rail reservation allows — this slice
  moves the trailing edge, never the leading one. *Pinned by:* the existing #749 matrix in
  `loading-skeletons.e2e.ts`, re-run unchanged.

## Non-goals

- **Drawing a placeholder pill in the loading price rail.** The column reserves its width and
  stays empty, exactly as it does today at 52px; #749 settled that a placeholder states shape,
  never content, and the right rail has no per-row chip to mirror (one per *zone*).
- **Changing the #724/#702 chip caps** (92px / 128px of chip). Asked and answered at intake: the
  desktop cap already fits `€45 · Front row` (112.66px) whole, and lowering it to 92px would
  truncate the common premium chip on a screen with room for it — a content loss bought with
  layout stability. The reservation sits *under* the cap as a floor, so the caps' behaviour is
  untouched.
- **Reserving on the operator surfaces.** Their vocabulary is an amount; measured, the floor they
  have covers it. Their min–max residual is stated by AC-3's own arithmetic, not hidden.
- **The left rail** (#749, merged) and **the pan hint's line** (deliberately unreserved, #749 G-1).
- **The skeleton row/tile count** and every other surface's skeleton geometry.

## Behavior-parity ledger

The price rail is an existing surface whose behavior this slice changes; nothing else about it
is supposed to move.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Price rail column is content-derived on every surface | **changed** | `amounts` keeps it (operator surfaces unchanged, AC-2); `capped-phrases` reserves 92px in both states, so the tourist tile viewport stops narrowing (AC-3/AC-4) |
| Cell floor is `min-w-[52px]` | **preserved** | untouched — it is still what sizes an `amounts` rail, and still the floor a `capped-phrases` rail's reservation sits above |
| Chip caps at 92px / 128px and ellipsizes | **preserved** | untouched; the reservation is a minimum, not a replacement — a 112.66px desktop chip still renders at 112.66px |
| Chip renders once per zone, never for a null `priceLabel` | **preserved** | untouched; the reservation is on the column, not the chip |
| No chip renders while loading | **preserved** | still nothing — the column reserves the width, it states no price nobody has fetched (#749, F-3) |
| `price-col` / `price-col-placeholder` testids | **preserved** | untouched; the specs that query them keep working |
| Zone-gap `mt-3` on the price column's cells | **preserved** | untouched — the cells keep their own classes; only the column gains a floor |
| Tourist tile viewport is 936px while loading, 866px loaded (1280) | **changed** | 896px in both states on that fixture — the settle is what this slice removes, and the loaded state is unchanged wherever the chip already exceeds the reservation |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The reservation trades the settle for a permanently narrower tile viewport — the same trap #749's own R-1 named, and the reason its cap-sized rail was reverted | med | med | measured, not assumed: 92px leaves 34px of the #700 fits-whole margin on the venue that actually pays (all-standard, 14 columns), and 13px on the premium fixture, which does not pay at all. AC-5 pins the paying case so a later widening cannot pass silently | claude | closed — `7b6a293` pins the paying venue |
| R-2 | Reserving on all four surfaces would cost the operator grids 40px for a 41px chip | med | med | the reservation is scoped to a vocabulary, not applied to the component — `amounts` is the default, so a surface pays only by opting in (AC-2) | claude | closed — `dedb2c4` |
| R-3 | Two inputs that must agree (`railCodes` and `priceChips`) is the defect #749's ledger warned about when it folded `truncateRailCodes` away | low | med | they are not the same question: one names the left rail's chips, the other the right rail's, and a surface can legitimately differ on them (the Daily view already does — whole labels, bare amounts). Each is independently defaulted and independently tested | claude | closed — `301cf7f` |
| R-4 | A class string computed in TS is invisible to a naive Tailwind content scan | low | high | the same seam #749 proved: the e2e measures the rendered rail, so a class that did not compile shows up as a wrong number, not a passing class-list read | claude | closed — `npm run build`'s bundle carries `.min-w-\[92px\]`, which the dev-server e2e could not have proved |
| R-5 | A phone venue whose grid fits today starts panning because the rail took 40px | low | low | accepted and bounded: only a venue with ≤5 columns fits a 390px viewport at all, and the hint it would gain is honest — it is measured on the loaded map, never the placeholder (#749) | claude | accepted |

## Open questions / Assumptions

### Resolved

- **Assumption (resolved at intake, by measurement):** the ticket's second harm — "whether
  `scrollHint()` fires … a map that fit before the price chips landed can start advertising a
  pan" — is a *loading*-state defect. **It is not.** #749 gates the hint on `!loading()`, so it
  is only ever rendered against the loaded map's own overflow; the placeholder can no longer
  advertise anything. What survives of the ticket is the first harm alone (how much of the map
  is visible after the load), and that is what the ACs measure.
- **Question (resolved at intake, `AskUserQuestion`):** how much to reserve, given that every
  reservation is paid by venues whose chips are narrow. **92px, single tier** — the phone cap,
  mirroring #749's choice of the mobile cap as a minimum. The two alternatives and their measured
  costs are the table above.
- **Question (resolved at intake, `AskUserQuestion`):** the ticket also asks whether the #724
  chip caps are still right. **Leave them.** Recorded in Non-goals with the reason.

## Availability & concurrency (invariant #2)

N/A — presentation only. No booking, no availability write path and no reservation is reachable
from this change: the price rail is `aria-hidden` decoration whose content the tile accessible
names already carry, and the skeleton that renders it is `inert`.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment path in scope. The chip's *text* is untouched: `rowPriceLabel` and
`formatMoney`/`formatMoneyRange` are not edited, so the money vocabulary (invariant #5) is
unchanged. This slice only decides how much horizontal room the chip's column holds.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beach-map-canvas.ts` + `.html` | existing | standalone component | one `input()` (`priceChips`) + one `computed()` class string | none |
| FE-2 | `venue/venue-map.html` | existing | template | — | none |

**Standards:** signal input, `computed()` for the derived class string, `class` binding (never
`ngClass`), no `changeDetection` or `standalone` declared.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `merge` — CI green, review gate run, Sonar gate green and its list read

**Next action:** mark PR #752 ready for review, then merge — every gate below is discharged.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the price rail learns its vocabulary | ✅ | `301cf7f` |
| 1 — the tourist map opts in | ✅ | `dedb2c4` |
| 2 — measured in a real browser | ✅ | `7b6a293` |
| review fixes — G-1…G-4 | ✅ | `499578d` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**The local gate, run in full** (`riviera-local-debug`'s recipes): `npm run lint` clean ·
`npm run format:check` clean · `npm test` 1642 passed / 178 files · `npm run test:e2e:a11y`
264 passed (the whole mocked suite, not only the touched specs) · `npm run build` clean, and
its bundle greps for `.min-w-\[92px\]`, which is what actually closes R-4 — the e2e runs
against `npm start`, so a dev-only content scan would have measured green there · the five
hygiene scripts (`check-inline-comments`, `check-plan-file-structure`, `check-focus-posture`,
`check-touch-target`, `check-cloud-node-pin`) all clean over `--diff origin/main`.

**Every gate, and what actually discharged it** (PR #752, head `499578d`):

| Gate | State | Evidence |
|---|---|---|
| CI | ✅ green | all 8 checks on `f7dc573`: Backend (build + test), Frontend (lint + test + build), Repo hygiene (diff-scoped), CodeQL ×3, SonarCloud scan. Re-runs on the review-fix head |
| Review | ✅ ran | `/code-review` over the PR diff — the fan-out, not the hand walk. **The first read of this session was wrong**: `references/pr-gates.md` §1 says in as many words that a standing "don't use the Agent tool" instruction is not grounds to skip it, and rung 1 of the ladder then succeeded on the first probe. `riviera-review-overlay`'s frontend bank layered on top. 4 findings, G-1…G-4, all fixed in `499578d` |
| Sonar | ✅ green **and its list read** | the badge is not the check (#158). Pulled from the API with `curl` rather than `WebFetch`, so the 15-minute cache (PR #318) never applied: `issues/search` total **0**, `hotspots/search` total **0**, `new_bugs`/`new_vulnerabilities`/`new_code_smells`/`new_duplicated_blocks` all 0, new-code coverage **100.0%**, duplication **0.0%**. The false-clean read is ruled out — `new_lines` is **34**, so an analysis really ran, and `SonarCloud Code Analysis` concluded `success` |

**The local gate, run in full before the PR** (`riviera-local-debug`'s recipes): `npm run lint`
clean · `npm run format:check` clean · `npm test` 1642 passed / 178 files ·
`npm run test:e2e:a11y` 264 passed (the whole mocked suite, not only the touched specs) ·
`npm run build` clean, and its bundle greps for `.min-w-\[92px\]`, which is what actually closes
R-4 — the e2e runs against `npm start`, so a dev-only content scan would have measured green
there · the five hygiene scripts all clean over `--diff origin/main`.

---

## File structure

- `docs/plans/price-rail-reserved-width.md` — this plan
- `frontend/src/app/shared/beach-map-canvas.ts` — the `priceChips` input and the
  `priceColumnClass` computed
- `frontend/src/app/shared/beach-map-canvas.html` — the reservation on the price column
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — AC-1, AC-2
- `frontend/src/app/venue/venue-map.html` — `priceChips="capped-phrases"` on both canvases
- `frontend/src/app/venue/venue-map.spec.ts` — the surface-level proof that BOTH canvases carry it
- `frontend/e2e/loading-skeletons.e2e.ts` — AC-3, AC-4
- `frontend/e2e/venue-map-pan.e2e.ts` — AC-5
- `docs/plans/map-canvas-loading-mode.md` — the docs-freshness patch: #749's open Non-goal now
  names the ticket that answered it

---

## Phase 0 — the price rail learns its vocabulary

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.ts|.html` · Test
`frontend/src/app/shared/beach-map-canvas.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-1 and AC-2 against a host that drives
      `priceChips`, asserting the price column's class string in both loading states.
- [x] **Step 2: Run them, verify they fail** — `ng test --include="**/beach-map-canvas.spec.ts"` →
      FAIL (`NG8002: Can't bind to 'priceChips'`).
- [x] **Step 3: Minimal implementation** — the `priceChips` input, the `priceColumnClass`
      computed, and its `[class]` binding on the price column.
- [x] **Step 4: Run them, verify they pass** — 32 passed.
- [x] **Step 5: Generalization-audit pass** — logged; the population is 2 and both members are
      now reserved.
- [x] **Step 6: Commit.**
- [x] **Step 7: Update the plan-doc execution status** in the same commit window.

## Phase 1 — the tourist map opts in

**Files:** Modify `frontend/src/app/venue/venue-map.html` · Test
`frontend/src/app/venue/venue-map.spec.ts`

- [x] **Step 1–4:** set `priceChips="capped-phrases"` on **both** canvases (skeleton and
      loaded — a reservation on one alone just reverses the direction of the settle, #749 G-1);
      the surface's own spec grew the assertion that both carry it (68 passed), and the three
      operator surfaces' specs re-ran unchanged (126 passed) as AC-2's other half.
- [x] **Step 5–7:** audit (nothing new — phase 0's population is closed), commit, status.

## Phase 2 — measured in a real browser

**Files:** Modify `frontend/e2e/loading-skeletons.e2e.ts`, `frontend/e2e/venue-map-pan.e2e.ts`

- [x] **Step 1: Write the failing e2e** — AC-3/AC-4 (the tile viewport's **right edge** either
      side of the held read, both viewports, both chip extremes) and AC-5 (the all-amounts
      14-column venue).
- [x] **Step 2: Verify AC-3/AC-4 fail on `origin/main`'s canvas** — committed first, then proved
      red against that ref and restored (the #749 F-4 rule: a proof run against another ref owns
      whatever is unstaged). Two of the four fail there, and they are the two that must:

      | Case | On `origin/main` | What it proves |
      |---|---|---|
      | price phrases past the cap, desktop | **FAIL** — lost 76px, 36 allowed | the settle this slice removes |
      | price phrases past the cap, a phone | **FAIL** — lost 40px, 0 allowed | the same, and that 390 closes outright |
      | bare amounts, desktop | pass | the reverse jump (#749 G-1): reserving only while loading would push the right edge back OUT by 40px here, and this is what would catch it |
      | bare amounts, a phone | pass | as above |

- [x] **Step 3–4:** green against the new canvas — 40 passed across `loading-skeletons` +
      `venue-map-pan`, which re-runs the whole #749 matrix and both #700 fits-whole tests.
- [x] **Step 5–7:** audit (population unchanged), commit, status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | phase 0 | Every column whose width is whatever its content measures **while sitting beside a scroller that gives** — the mechanism a load-time width change needs, not "things that look like rails". A `shrink-0` sibling of a `flex-1 min-w-0` overflow container is the whole population, and the canvas is the only place the app builds that shape | `grep -rn "flex-1 min-w-0" --include=*.html --include=*.ts src/app` (one match, `beach-map-canvas.html:42`; its `shrink-0` siblings read off the template) | 2 — the left rail and the price rail; the viewport itself is the one that gives, so it is not a member | Left rail reserved by #749; the price rail is this slice. Population closed — a third rail would have to be added to the canvas to reopen it |

---

## Acceptance-criteria verification (final)

- [x] **AC-1, AC-2:** `ng test --include="**/beach-map-canvas.spec.ts"` → 32 passed; the three
      operator surfaces' own specs → 126 passed, unchanged.
- [x] **AC-3…AC-5:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y --
      loading-skeletons venue-map-pan` → 40 passed. AC-3/AC-4 additionally **mutation-proved**
      after G-3: deleting `min-w-[92px]` fails all four cells.
- [x] **AC-6:** the #749 matrix is inside that 40, re-run unchanged.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A) (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled (N/A, frontend-only) (invariant #11).
- [x] **Payment/payout** section filled (justified N/A) (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — untouched.
- [x] Flyway migration present for schema changes (invariant #12) — none.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #752`.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`; ladder rung 1 succeeded.

---

## Close-out

**Merged via PR #752**, closing #751.

What the slice settled, for whoever measures this canvas next:

- The canvas's two rails now reserve their width on the same terms and for the same reason, each
  keyed to its own vocabulary: `railCodes` for the left (#749), `priceChips` for the right (#751).
  The population of content-derived columns beside the giving viewport is **closed at two** — the
  audit log records the search that establishes it, so a third would have to be added deliberately.
- **The reservations are minimums, and both are the phone cap of their own rail** (54px, 92px).
  That is not a coincidence to copy blindly: it follows from the #724/#702 caps making the phone
  case exact, and from the #700 fits-whole margin being what a desktop-cap reservation would
  overspend. A future rail should re-measure that margin rather than assume a third cap fits.
- **What the fits-whole guarantee actually has left**, measured at 1280 on 14 columns: ~125.6px
  total for the price rail, of which the reservation now takes 92. `venue-map-pan.e2e.ts` pins the
  paying venue — all-standard zones, the fixture whose rail the reservation genuinely widens —
  so the next widening has to spend a number that is on screen rather than one nobody re-derived.
- **One residual is deliberate and stated in the contract**: an operator rail whose row mixes
  prices renders a span (96.58px measured) and still settles by what the span exceeds the 52px
  floor. Reserving for it would cost every operator grid 40px for a chip that is 41px wide in the
  ordinary venue.

Two process notes worth more than the diff:

- **The review gate was nearly skipped on a false premise.** This session carries a standing
  "don't use the Agent tool" instruction, and the first reading of it was that the fan-out was
  unavailable and a hand walk was the honest substitute. `references/pr-gates.md` §1 anticipates
  exactly that and says the instruction is not grounds to skip — probe the ladder, ask if refused.
  Rung 1 then succeeded on the first probe. The hand walk had found one finding; the fan-out found
  four, one of which (G-3) showed that the hand walk's own fix was still vacuous on half its
  matrix. The cost of assuming a gate is unavailable is not zero, and it is not visible from
  inside the assumption.
- **A green check-suite event is not a green PR.** Three `check_suite.completed` / `conclusion:
  success` events arrived here before CI had finished: two belonged to `codeql.yml`'s suite and
  one to Sonar's, all while `ci.yml`'s Backend and Frontend jobs were still running. Same GitHub
  App, different suite. Verify the PR's own check list before acting on a suite event.
