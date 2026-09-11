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
CI-safe suite) · `riviera-frontend` (placement: the new spec is mocked, so `frontend/e2e/`, not
`frontend/e2e/real-backend/`; the shared fixture belongs beside the other mock modules in
`e2e/support/`) · `angular-developer` + the angular-cli MCP `get_best_practices` (loaded late, at
the review gate, on RV-PROC-1 F-3 — the styling row of the routing table requires them and the
plan's first pass named neither; re-vetted the `app.ts` change against the v22 posture and it
changed nothing: no decorator metadata, no `ngClass`/`ngStyle`, no signal API, three additions to
hoisted class strings the existing `[class]` bindings already consume)

**Branch:** `claude/sdlc-1062-cldbip` — the cloud session's designated remote branch stands in for
`bugfix/tourist-mobile-zoom-sweep` (`riviera-sdlc` § *Remote / cloud session addendum*). Merged
via PR #1063.

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
- [x] **AC-3:** Given the tourist bottom tab bar at a phone width, and all three header disclosure
  triggers — the account chip and menu button at a desktop width, the theme swatch at both — when
  their `touch-action` is read from computed style, then every one includes `manipulation`; `CHIP`
  and `POP_BUTTON` are unchanged in the diff.
  *Seam:* computed `touch-action` on the rendered controls, read through `expectTouchManipulation` ·
  *Pinned by:* `mobile-zoom-tourist.e2e.ts` — `the tab bar keeps its double-tap`,
  `the header disclosure triggers keep their double-tap`, and
  `the theme swatch keeps its double-tap at a phone width too`.

## Non-goals

- Raising a field that already measures ≥ 16px, or restyling any tourist surface beyond the
  `touch-manipulation` additions.
- Giving `touch-manipulation` to controls PR #1047 deliberately left alone, or to the shared `CHIP`
  and `POP_BUTTON` recipes — the issue is explicit that consumers compose.
- The `viewport` meta tag: `user-scalable=no` / `maximum-scale=1` is the forbidden fix (WCAG 1.4.4).
- The operator/admin halves of either bug — shipped in PR #1061.
- The popover rows inside the theme picker and the account menu: a list read then tapped once, not
  a control toggled in quick succession. (The theme swatch BUTTON is in scope — see F-2.)

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
### Resolved

- **Assumption (resolved, F-2):** that the account chip and menu button were the whole of the
  tourist header's "same shape" set. The review gate found a third — the theme swatch — and it is
  the one that matters most, being the only header trigger a phone renders. All three now carry the
  opt-out.

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

**Stage pointer:** `review gate cleared — all findings fixed; verifying CI + Sonar on the new head, then merge`

**Next action:** Confirm CI green and the Sonar new-issue list empty on the new head, then merge via
PR #1063 and run the close-out checklist.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared tourist fixture + the field sweep (AC-1, AC-2) | ✅ | 198d5b6b |
| 1 — The double-tap opt-out (AC-3) | ✅ | 6727897b |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Review gate:** ran at ready-for-review over `1a058115..09dcc539` (base `main` @ `1a058115`,
6 files / +528 / -105, matched against the PR by `check-review-range.mjs`), at **high** effort —
`code-review:code-review`, rung 1 of the ladder, with `riviera-review-overlay` layered on. Five
reviewers: CLAUDE.md-adherence, shallow-bug, git-history, prior-PR-comments, in-code-comments. The
bug and history reviewers returned clean; the others produced F-2, F-3 and F-4.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI — `Repo hygiene (diff-scoped)` red | RV-STYLE-1 ×2 in the new spec: a PR number (provenance) in the file TSDoc, and a two-line inline comment | fixed — both rewritten; `check-inline-comments.mjs --diff origin/main` green |
| F-2 | review gate — prior-PR-comments reviewer | The theme swatch (`CLS.swatchBtn`, `theme-toggle`) is a header disclosure trigger too and was left out. It is the sharpest case of the three: the chip and menu button are `sm:flex`, so the swatch is the only header trigger a phone renders, and double-tap is a phone gesture. The "lone control, not a cluster" defence was inconsistent — the two triggers already fixed are equally lone | fixed — `touch-manipulation` added; new phone-width test, verified red first (`theme-toggle is touch-action: auto`) |
| F-3 | review gate — CLAUDE.md reviewer | RV-PROC-1: *Skills consulted* named neither `angular-developer` nor the angular-cli MCP, which the routing table's Angular-styling row requires; `riviera-frontend` was listed but had not actually been loaded | fixed — both loaded and the `app.ts` change re-vetted (no change), line rewritten to say what actually happened |
| F-4 | review gate — in-code-comment reviewer | `tourist.mocks.ts`'s doc comment said a spec needing a session layers `auth-mocks.ts` over the fixture, citing the account page — but this PR's own account-page test overrides `/api/auth/me` directly. A comment wrong about code in the same diff | fixed — reworded to describe both routes honestly |
| F-5 | self, while fixing F-2 | The new swatch test's explanatory comment ran to two lines — the same RV-STYLE-1 rule F-1 had just fixed | fixed — one line |

---

## File structure

- `docs/plans/tourist-mobile-zoom-sweep.md` — this plan, retired at the next close-out after merge
- `frontend/e2e/support/tourist.mocks.ts` — **new**; the tourist API fixture + `mockTourist`, moved
  verbatim out of `touch-targets-tourist.e2e.ts` so both sweeps share one copy
- `frontend/e2e/touch-targets-tourist.e2e.ts` — fixture removed, imported instead; no test changes
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — **new**; the tourist half of the zoom pair
- `frontend/e2e/mobile-zoom.e2e.ts` — header comment now points at the tourist file
- `frontend/src/app/app.ts` — `touch-manipulation` on `TAB`, `CLS.accountChip`, `CLS.menuBtn`,
  and `CLS.swatchBtn` (F-2)
- `docs/plans/venue-photo-retina-srcset.md` — **deleted**; its PR #1058 has merged, so the close-out
  sweep retires it (nothing cites it)

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
| 2026-09-11 | phase 0 | Every tourist surface rendering a field of a type iOS Safari zooms into (the mechanism: a caret-taking `input`/`select`/`textarea` on a tourist route) | `grep -rn '<input\|<select\|<textarea' --include=*.html --include=*.ts auth/ booking/ pages/ venue/ shared/ core/` over `frontend/src/app` | `auth/` ×4 pages, `booking/` booking-dialog + review-panel + find-booking, `pages/home/home.html` ×3, plus `shared/confirm-with-reason.ts` | All tourist sites swept. `confirm-with-reason.ts` is admin-only (its three consumers are all `admin/`), so it belongs to the console half already covered by `mobile-zoom.e2e.ts` — skipped, not missed || 2026-09-11 | phase 1 | Every control recipe that could want the double-tap opt-out (the mechanism: a `touch-action` default of `auto` on a densely or repeatedly tapped tourist control) | `grep -rn 'touch-manipulation' frontend/src/` — the complement is what lacks it | The tourist `TAB`, `accountChip`, `menuBtn` and `swatchBtn`; the slideshow arrows, dot picker, gallery tiles, beach map, calendar and star rating were already covered | Fixed all four. `swatchBtn` was missed on the first pass and caught at the review gate (F-2): the first sweep judged by cluster density, but the operative criterion is a control tapped twice fast, which a disclosure trigger is. The popover rows stay out — read, then tapped once |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Verified — the tourist zoom spec, 13/13, every surface above its floor and nothing under 16px.
- [x] **AC-2:** Verified — `find-booking.ts`'s `cls.input` at 15px failed the sweep naming `input[data-testid="find-code"] at 15px`; reverted.
- [x] **AC-3:** Verified — the three double-tap tests pass, the swatch one red first (`theme-toggle is touch-action: auto`); `CHIP`/`POP_BUTTON` absent from the diff.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section filled (justified N/A, frontend-only).
- [x] **Payment/payout** section filled (justified N/A).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — this commit; it also retires `docs/plans/venue-photo-retina-srcset.md`, whose PR #1058 has merged.
- [x] **The review gate ran in full** — rung 1 of the ladder plus `riviera-review-overlay`; five reviewers, F-2..F-4 fixed.
