# Tourist mobile-zoom sweep + tab-bar double-tap opt-out — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Measure every tourist-surface field against the 16px iOS-Safari auto-zoom floor, and give
the tourist bottom tab bar and its two header disclosure triggers the `touch-action: manipulation`
double-tap opt-out the console half already has.

**Architecture:** The measuring helpers already exist and are generic
(`e2e/support/mobile-zoom.ts`); this slice is a spec of tourist surfaces plus three class
additions. The one structural decision is to **extract the tourist API fixture into
`e2e/support/tourist.mocks.ts`** rather than copy it: the console half reaches its fixture through
`mockWholeConsole`/`mockWholeAdminConsole` support modules, and copying `touch-targets-tourist`'s
~120-line fixture would duplicate a block the Sonar gate counts and let the two copies drift.

**Persistence:** N/A — frontend-only, no backend code, no tables, no migration.

**Source of intent:** GitHub issue #1062 (deferred from #1048 / PR #1061, the console half of the
same pair; the tourist field-raising half was PR #1047).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no open PRs,
so no in-flight overlap and no shared-file contention; frontend-only, so no Flyway number to claim) ·
`riviera-plan-doc` (this template — forced the File-structure list and the vacuity risk R-1) ·
`tdd` (AC-3 red-first on the missing `touch-manipulation`; AC-1/AC-2 are a characterization sweep,
proven non-vacuous by a reverted mutation rather than by a natural red) ·
`riviera-review-overlay` (review gate — RV-FE-E2E decides the suite; runs at ready-for-review) ·
`riviera-docs-freshness` (<pending — runs at merge close-out>) ·
`riviera-tailwind` (rule 6 kept the opt-out a `touch-manipulation` class beside `EDGE_SLOT_RING`
rather than a new ring or an `@apply`; the shared `CHIP`/`POP_BUTTON` recipes stay untouched and
each consumer composes) · `playwright-cli` + `frontend/.claude/CLAUDE.md` (spec shape, the mocked
CI-safe suite) · `riviera-frontend` (the new spec is mocked, so it lands in `frontend/e2e/`, not
`frontend/e2e/real-backend/`)

**Branch:** `claude/sdlc-1062-cldbip` — the cloud session's designated remote branch stands in for
`bugfix/tourist-mobile-zoom-sweep` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given each tourist surface that renders a field — the home filter bar, the four auth
  card states, forgot / reset / account-password, the booking dialog, the review form and the
  find-a-booking modal — when it has settled, then `expectNoFocusZoom` sweeps at least that
  surface's stated `minFields` and reports no field under 16px.
  *Seam:* the rendered route (`/`, `/account/*`, `/booking/:code`) and its computed `font-size`,
  read through `expectNoFocusZoom` · *Pinned by:* `mobile-zoom-tourist.e2e.ts` — every
  `— no field zooms the page in on focus` test.
- [x] **AC-2:** Given a tourist field whose size arrives through a hoisted `cls`/`CLS` recipe rather
  than the tag's own `class` attribute, when that recipe drops below 16px, then the sweep fails
  naming the field — proven by mutating one hoisted recipe (`booking/find-booking.ts`'s `cls.input`)
  and reverting it.
  *Seam:* the same computed `font-size`, which is blind to how the class arrived ·
  *Pinned by:* `mobile-zoom-tourist.e2e.ts` — the find-a-booking case, plus the recorded mutation run.
- [x] **AC-3:** Given the tourist bottom tab bar at a phone width and the header's account chip and
  menu button at a desktop width, when their `touch-action` is read from computed style, then every
  one of them includes `manipulation`; `CHIP` and `POP_BUTTON` are unchanged in the diff.
  *Seam:* computed `touch-action` on the rendered controls, read through `expectTouchManipulation` ·
  *Pinned by:* `mobile-zoom-tourist.e2e.ts` — `the tourist tab bar keeps its double-tap` and
  `the tourist header disclosure triggers keep their double-tap`.

## Non-goals

- Raising a field that already measures ≥ 16px, or restyling any tourist surface beyond the
  `touch-manipulation` additions.
- Giving `touch-manipulation` to controls PR #1047 deliberately left alone, or to the shared `CHIP`
  and `POP_BUTTON` recipes — the issue is explicit that consumers compose.
- The `viewport` meta tag: `user-scalable=no` / `maximum-scale=1` is the forbidden fix (WCAG 1.4.4).
- The operator/admin halves of either bug — shipped in PR #1061.
- The theme swatch button and the popover rows: single controls and a list, not the dense
  repeatedly-tapped cluster the opt-out is for.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new test coverage plus additive classes; no surface is retired or replaced. The one moved
artifact is the `touch-targets-tourist.e2e.ts` fixture, moved verbatim into
`e2e/support/tourist.mocks.ts`; parity is proven by re-running that spec unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A sweep passes vacuously — the surface rendered its empty/error state and measured nothing | med | high | Every surface states a `minFields` floor (the helper fails below it) AND a content marker awaited before the sweep; the floors are derived from the counted fields in the source, not guessed | claude | closed — 10 surfaces swept, each above its floor |
| R-2 | Extracting the shared fixture regresses `touch-targets-tourist.e2e.ts` | low | med | Move the fixture verbatim, change only the import; re-run that whole spec file before and after | claude | closed — 15/15 pass after the move |
| R-3 | The sweep is green everywhere and proves nothing, because no tourist field is actually under 16px today | high | med | Expected — the issue says so. Prove the sweep bites by mutating a hoisted recipe (AC-2) and recording the failure, then revert | claude | closed — `find-booking.ts` `cls.input` at 15px failed the sweep naming the field; reverted |
| R-4 | `touch-manipulation` on `TAB` collides with the tab bar's `EDGE_SLOT_RING` or its `before:` marker | low | low | `touch-action` is an input-gesture property with no paint; assert computed `touch-action` and leave the existing tab-bar ring/marker e2e (`tourist-tab-bar.e2e.ts`) green | claude | closed — 52 shell e2e + 97 shell unit tests green after the change |
| R-5 | The header chips are `sm:flex` (tablet-and-up), so a phone-width assertion would find nothing and pass vacuously | med | med | `expectTouchManipulation` fails on a zero match; assert the chips at desktop width and the tab bar at phone width, each setting the width it needs | claude | closed — each assertion sets its own width; the helper's zero-match guard covers the rest |

## Open questions / Assumptions

- **Assumption:** No tourist field carries a responsive text size, so one viewport measures them
  all — the same premise the console half states. *Verified:* `grep -rno '\b(sm|md|lg|xl):text-\[[0-9.]*px\]' frontend/src/app/` returns nothing. *Owner:* claude · *Resolves by:* phase 0.
- **Assumption:** The tourist header's account chip (`nav-user`) and menu button (`nav-menu`) are the
  "same shape" as the console's two header disclosure triggers the issue points at, so both get the
  opt-out. *Owner:* claude · *Resolves by:* phase 1 (review gate confirms).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds an e2e spec and three CSS classes; it reads no
`set_availability` row and writes none. The booking dialog is opened only to measure its fields, and
the mocked suite never reaches a real reservation.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; the pay page is not a surface of this sweep (its only
fields live in Stripe's cross-origin iframe, out of the sweep's reach by the same stated
non-goal the touch-target sweep records).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/app/app.ts` (`TAB`, `CLS.accountChip`, `CLS.menuBtn`) | existing | standalone component | unchanged — class-string recipes only | none |

**Standards:** no component API changes; the three edits are additions to hoisted class strings,
consumed by the existing `[class]` bindings in `app.html`. No deviation.

## FE↔BE contract

N/A — no contract change. The new spec consumes the existing mocked endpoints only.

## Execution status

**Stage pointer:** `implement — both phases done, opening the draft PR for the CI gate`

**Next action:** Push the branch, open the draft PR so CI fires, then mark ready for review and
run the Review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared tourist fixture + the field sweep (AC-1, AC-2) | ✅ | 198d5b6b |
| 1 — The double-tap opt-out (AC-3) | ✅ | 6727897b |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/tourist-mobile-zoom-sweep.md` — this plan, retired at the next close-out after merge
- `frontend/e2e/support/tourist.mocks.ts` — **new**; the tourist API fixture + `mockTourist`, moved
  verbatim out of `touch-targets-tourist.e2e.ts` so both sweeps share one copy
- `frontend/e2e/touch-targets-tourist.e2e.ts` — fixture removed, imported instead; no test changes
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — **new**; the tourist half of the zoom pair
- `frontend/e2e/mobile-zoom.e2e.ts` — header comment now points at the tourist file
- `frontend/src/app/app.ts` — `touch-manipulation` on `TAB`, `CLS.accountChip`, `CLS.menuBtn`

---

## Phase 0 — Shared tourist fixture + the field sweep

**Files:** Create `frontend/e2e/support/tourist.mocks.ts` · Create
`frontend/e2e/mobile-zoom-tourist.e2e.ts` · Modify `frontend/e2e/touch-targets-tourist.e2e.ts`

- [x] **Step 1:** Move the fixture verbatim into `support/tourist.mocks.ts`; re-run
  `npx playwright test e2e/touch-targets-tourist.e2e.ts --config=playwright-a11y.config.ts` → PASS (R-2).
- [x] **Step 2:** Write the sweep spec — a `SURFACES` loop for the goto-only surfaces, plus a case
  each for reset-with-token, the signed-in account page, and the three gated states.
- [x] **Step 3:** Run it → PASS (10/10 sweeps) (R-3: no known broken field).
- [x] **Step 4:** Prove it bites — drop `booking/find-booking.ts`'s `cls.input` to `text-[15px]`,
  re-run the find-a-booking case → FAIL naming the field; revert.
- [x] **Step 5: Generalization-audit pass** — population: every tourist surface rendering a
  zooming-type field; enumerated by grepping the field tags, not by resemblance.
- [x] **Step 6: Commit** — `Sweep the tourist surfaces for iOS focus-zoom fields (#1062)`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The double-tap opt-out

**Files:** Modify `frontend/src/app/app.ts` · Modify `frontend/e2e/mobile-zoom-tourist.e2e.ts`

- [x] **Step 1:** Write the two failing tests — the tab bar at 390px, the header triggers at 1280px.
- [x] **Step 2:** Run → FAIL: `tab-beaches`/`tab-bookings`/`menu-toggle` and `nav-menu` all read `touch-action: auto`.
- [x] **Step 3:** Add `touch-manipulation` to `TAB`, `CLS.accountChip`, `CLS.menuBtn`; leave `CHIP`
  and `POP_BUTTON` untouched.
- [x] **Step 4:** Run → 12/12 PASS; the shell regression set (`tourist-tab-bar`, `tourist-header`, `touch-targets-tourist`, `current-page-marker`, `focus-ring-baseline`) 52/52 and the shell unit specs 97/97.
- [x] **Step 5: Generalization-audit pass** — population: every dense repeatedly-tapped tourist
  cluster still on the browser's double-tap, enumerated by grepping `touch-manipulation` against the
  control recipes.
- [x] **Step 6: Commit** — `Opt the tourist tab bar and header triggers out of double-tap zoom (#1062)`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-11 | phase 0 | Every tourist surface rendering a field of a type iOS Safari zooms into (the mechanism: a caret-taking `input`/`select`/`textarea` on a tourist route) | `grep -rn '<input\|<select\|<textarea' --include=*.html --include=*.ts auth/ booking/ pages/ venue/ shared/ core/` over `frontend/src/app` | `auth/` ×4 pages, `booking/` booking-dialog + review-panel + find-booking, `pages/home/home.html` ×3, plus `shared/confirm-with-reason.ts` | All tourist sites swept. `confirm-with-reason.ts` is admin-only (its three consumers are all `admin/`), so it belongs to the console half already covered by `mobile-zoom.e2e.ts` — skipped, not missed || 2026-09-11 | phase 1 | Every control recipe that could want the double-tap opt-out (the mechanism: a `touch-action` default of `auto` on a densely or repeatedly tapped tourist control) | `grep -rn 'touch-manipulation' frontend/src/` — the complement is what lacks it | The tourist `TAB`, `accountChip` and `menuBtn`; PR #1047 already covered the slideshow arrows, dot picker, gallery tiles, beach map, calendar and star rating | Fixed all three. The theme swatch and the popover rows were judged out: a lone control and a list, not the dense cluster the opt-out is for (recorded as a Non-goal) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run the tourist zoom spec → every surface sweeps ≥ its floor, none under 16px.
- [ ] **AC-2:** The recorded mutation run failed naming the field; reverted.
- [ ] **AC-3:** Run the two double-tap tests → PASS; `git diff` shows `CHIP`/`POP_BUTTON` unchanged.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (justified N/A, frontend-only).
- [ ] **Payment/payout** section filled (justified N/A).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit.**
- [ ] **The review gate ran in full** — the `/code-review` ladder plus `riviera-review-overlay`.
