# Star-Rating Inline Field Error Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A guest who submits the review form with no star picked hears why from the
radiogroup itself — `app-star-rating` renders its own inline `role="alert"` error,
`[appFieldErrorFor]`-associated to the `role="radiogroup"` element — instead of the
message only landing in the booking page's parent result region.

**Architecture:** `StarRating` already implements `FormValueControl<number | null>`;
Signal Forms auto-binds the interface's **optional** `invalid`/`errors` input signals
whenever the component declares them (confirmed against angular.dev's Custom Controls
guide, v22 — the `StatefulInput` worked example), so no plumbing is needed beyond
declaring the two inputs. The component gains its own `submitAttempted` input (mirroring
the gate every sibling field on this form already uses) and renders the inline error
internally, associated to a `#radiogroup` template ref on its own `role="radiogroup"`
div — never to an individual `role="radio"` button (issue #825, point 3). This follows
the `booking-cutoff-field.ts` precedent: a shared field-shaped component owns its own
error display rather than exposing its internal DOM to the caller.

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariant #1
and #12 untouched).

**Source of intent:** GitHub issue #825 · OQ-2 of `docs/plans/field-error-aria-association.md`
(deferred there because #821 was association-only and `app-star-rating` had no inline
error element for `[appFieldErrorFor]` to attach to).

**Skills consulted:** `riviera-sdlc` (routing — the issue was already grilled once at
#821's OQ-2; re-checked here that no other PR touches `star-rating.ts`/`review-panel.ts`)
· `riviera-plan-doc` (this template) · `tdd` (each behavior red→green below) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(`N/A — this slice discharges an already-tracked OQ; no substrate doc states a fact this
diff would falsify beyond the OQ-2 resolution row itself, updated in the same PR`) ·
`riviera-frontend` (placement: no new files — `star-rating.ts` stays in `shared/`,
`review-panel.ts`/`booking-view.ts` stay in `booking/`) · `riviera-tailwind` (reused the
existing `text-riv-error-ink` field-error recipe already proven over the card glass by
`review-panel.contrast.spec.ts` — no new contrast spec needed, no new token) ·
`angular-developer` + angular-cli MCP `search_documentation` (v22: confirmed
`FormValueControl`'s optional `invalid`/`errors` inputs are auto-wired by `[formField]`
with no extra plumbing — the `StatefulInput` example) · `playwright-cli` (extends the
mocked e2e suite with the radiogroup's own `toHaveAccessibleDescription` case, alongside
the existing display-name one).

**Branch:** `claude/sdlc-825-25yipe` — **cloud-session substitution** for the
`bugfix/star-rating-inline-error` this plan would otherwise name (`riviera-sdlc`
§Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the review form with no star picked, when the guest submits, then
  `app-star-rating`'s `role="radiogroup"` element carries `aria-describedby` naming an
  inline error and `aria-invalid="true"`, and the error text is "Pick a star rating."
  *Pinned by:* `star-rating.spec.ts` › `describes itself with the required error once a
  submit is attempted with nothing picked`.
- [x] **AC-2:** Given that error showing, when a star is then picked, then the error
  element is removed and the radiogroup no longer carries `aria-describedby`/
  `aria-invalid`. *Pinned by:* `star-rating.spec.ts` › `stops describing itself once a
  star is picked`.
- [x] **AC-3:** Given no submit attempted yet, when the form first renders with nothing
  picked, then no error shows (the field is invalid from the first render, but the gate
  is submit-attempted, matching the comment/display-name fields). *Pinned by:*
  `star-rating.spec.ts` › `shows no error before a submit is attempted`.
- [x] **AC-4:** Given the review panel, when no star is picked and submit is pressed,
  then nothing is sent, the panel does **not** emit a separate "blocked" event, and the
  booking page's shared result region stays empty — the inline error is the only
  surface. *Pinned by:* `review-panel.spec.ts` › `sends nothing and shows the inline
  error when no star is picked` and `describes the radiogroup by its own error, and
  stops once a star is picked`, plus `booking-view.spec.ts` › `shows the inline star
  error, not the shared result region, when no star is picked`.
- [x] **AC-5:** Given a real browser, when the review form is submitted with no star
  picked, then the radiogroup's accessible description equals the rendered error text.
  *Pinned by:* `e2e/review-a-stay.e2e.ts` › `an unrated submit describes the radiogroup
  itself to assistive technology`.
- [x] **AC-6:** Given the touched surfaces, when their existing axe specs run, then no
  new critical/serious violation is reported. *Pinned by:* `star-rating.spec.ts`'s and
  `review-panel.spec.ts`'s existing `expectNoAxeViolations` calls, re-run with a star
  missing, plus the e2e's `expectNoSeriousAxeViolations`.

## Non-goals

- **No change to the required rule, the message text, or any other field's gating.**
  Comment and display-name keep exactly the `submitAttempted()` gate they have today.
- **No change to `appFieldErrorForInvalidValue`.** A missing rating is a genuine value
  problem, so the default (`true`, `aria-invalid` set) applies — issue #825 point 2
  flags this explicitly as "nothing extra to bind."
- **`FieldErrorFor` itself is untouched.** This slice is a new call site, not a directive
  change.

## Behavior-parity ledger (retirement / replacement slices only)

**Not a byte-for-byte parity slice, but one existing behavior is deliberately removed**
(decided by issue #825 point 4 — "two copies of one message in two places is its own
annoyance"):

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `ReviewPanel.blocked` output fires `REVIEW_REQUIRED`; `BookingView.blockReview()` writes it into `#review-result` and moves focus there | **dropped, replaced** | The inline error on the radiogroup is now the only surface for this failure, matching how the comment/display-name fields already behave (no `blocked`-equivalent exists for them, no focus move — focus stays on the pressed submit button). `blocked` had exactly one emission site (this one), so removing it deletes dead API surface rather than narrowing a used one. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **`FormValueControl`'s optional `invalid`/`errors` inputs might not be auto-wired the way the docs example shows**, if the installed `@angular/forms/signals` build differs. | low | med | Verified against angular.dev v22 docs via the angular-cli MCP (not training memory, per `frontend/.claude/CLAUDE.md`); `star-rating.spec.ts`'s phase-0 test proves it directly against the installed package, not assumed. | plan | closed — phase 0's test passed first run against the real, installed `@angular/forms/signals` (commit `74dfb80`) |
| R-2 | **Removing the `blocked` output breaks a caller this session didn't find.** | low | low | Grepped: `blocked` has exactly one producer (`review-panel.ts`) and one consumer (`booking-view.ts`'s `(blocked)` binding + `blockReview()`), both touched in this same slice. | plan | closed — confirmed by grep before editing; the compiler itself proved it (removing the emitter without the consumer edit failed to build) |
| R-3 | **The wrapping `<div>` added around the radiogroup changes `app-star-rating`'s only call site's spacing.** | low | low | `review-panel.ts`'s `<app-star-rating>` line carries no margin classes of its own today; the new wrapper only adds `flex flex-col gap-1.5` for the error's own line, matching the sibling fields' `cls.field` gap. `review-panel.contrast.spec.ts` re-run unchanged proves the ink is right; no dev server was run in this session to screenshot the layout. | plan | open — no visual regression is expected (the wrapper only changes vertical layout when the error shows, which is new content, not a reflow of existing content), but this is not screenshot-verified; flag for a human glance if one is convenient |

## Open questions / Assumptions

`None open.`

### Resolved

- **Assumption — held.** No other component binds `[formField]` to `app-star-rating`
  (confirmed by grep — only `review-panel.ts` and `star-rating.spec.ts`), so widening its
  markup carried no other blast radius. Re-confirmed on the finished tree.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, beach-map or `availability` code is in
scope; the slice adds an inline error to a review-form control.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` changes.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/star-rating.ts` | existing | standalone component | new `invalid`/`errors`/`submitAttempted` input signals | `FormValueControl` (Signal Forms) |
| FE-2 | `booking/review-panel.ts` | existing | component (inline template) | drops the `blocked` output; binds `[submitAttempted]` down | Signal Forms |
| FE-3 | `booking/booking-view.ts` | existing | component (inline template) | drops `blockReview()` + the `(blocked)` binding | n/a |

**Standards:** standalone, `input()` signal API, `@if`, no `standalone: true`, no
explicit `OnPush`. No new SCSS — reuses the existing `text-riv-error-ink` Tailwind
recipe already used by `review-panel.ts`'s two other field errors, so `riviera-tailwind`
has nothing to migrate.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `implement complete — the review gate and Sonar gate have not run in
this session (no PR was opened; see below)`.

**Next action:** none for this session. If a PR is opened for this branch, run the
Review and Sonar gates per `riviera-sdlc` `references/pr-gates.md` before merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `StarRating` renders its own inline error (AC-1..AC-3, AC-6) | ✅ | `74dfb80` |
| 1+2 — `ReviewPanel` wires `submitAttempted` down and drops `blocked`; `BookingView` drops the dead routing (AC-4) — **landed as one commit**, not two: removing `blocked` and its consumer are one compiler-checked unit (deleting the emitter without the consumer edit does not compile), so phase 1's step 3 and phase 2's step 3 could not land as separate green states | ✅ | `f3ecba0` |
| 3 — e2e (AC-5) + close-out | ✅ | (this commit) |

**Not done in this session, by instruction:** the task instructions for this session
(`riviera-sdlc` PR stage) direct opening a draft PR as soon as phase 0 lands, and running
the Review + Sonar gates before merge. This session's own operating instructions say not
to create a pull request unless the user explicitly asks for one, and no such request was
made — so the branch is pushed with all phases green, but **no PR exists, and neither the
Review gate nor the Sonar gate has run.** Do not treat this plan's phase table as a merge
signal; that only happens once a PR is opened and both gates are cleared.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/star-rating-inline-error.md` — this plan
- `frontend/src/app/shared/star-rating.ts` — the inline error + new input signals
- `frontend/src/app/shared/star-rating.spec.ts` — AC-1..AC-3, AC-6
- `frontend/src/app/booking/review-panel.ts` — drop `blocked`/`REVIEW_REQUIRED` export, wire `[submitAttempted]`
- `frontend/src/app/booking/review-panel.spec.ts` — AC-4 (panel half)
- `frontend/src/app/booking/booking-view.ts` — drop `blockReview()` + `(blocked)` binding
- `frontend/src/app/booking/booking-view.spec.ts` — AC-4 (booking-view half)
- `frontend/e2e/review-a-stay.e2e.ts` — AC-5
- `docs/plans/field-error-aria-association.md` — annotate OQ-2's resolution row

> Run `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing, with
> this doc staged.

---

## Phase 0 — `StarRating` renders its own inline error

**Files:** Modify `frontend/src/app/shared/star-rating.ts` · Test `frontend/src/app/shared/star-rating.spec.ts`

- [x] **Step 1: Write the failing test** — extend `star-rating.spec.ts`'s host to add
  `required(path.stars, { message: 'Pick a star rating.' })` (already present) and a
  `submitAttempted` signal bound to `[submitAttempted]`; assert AC-1..AC-3.
- [x] **Step 2: Run it, verify it fails** — `npm test -- star-rating` → FAIL (no error element, `invalid`/`errors`/`submitAttempted` inputs don't exist yet).
- [x] **Step 3: Minimal implementation** — add the three input signals and the `@if` error block, associated via a `#radiogroup` template ref.
- [x] **Step 4: Run it, verify it passes** — `npm test -- star-rating` → PASS.
- [x] **Step 5: Generalization-audit pass** — population `every FormValueControl in frontend/src/app` (there is exactly one: `star-rating.ts` itself), so no sibling site exists to sweep. Recorded below.
- [x] **Step 6: Commit** — `git commit -m "Give app-star-rating its own inline required error (#825)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `ReviewPanel` wires `submitAttempted` down, drops `blocked`

**Files:** Modify `frontend/src/app/booking/review-panel.ts` · Test `frontend/src/app/booking/review-panel.spec.ts`

- [x] **Step 1:** Update `review-panel.spec.ts`: remove the `blocked` output assertions, add the inline-error assertion for the stars field (mirroring the comment/display-name pattern already in the file) — red.
- [x] **Step 2:** Run `npm test -- review-panel` → FAIL.
- [x] **Step 3:** Bind `[submitAttempted]="submitAttempted()"` on `<app-star-rating>`; remove the `blocked` output, its emission in `send()`, and drop `export` from `REVIEW_REQUIRED` (no longer consumed outside the file).
- [x] **Step 4:** Run `npm test -- review-panel` → PASS, then its `*.contrast.spec.ts`.
- [x] **Step 5:** Generalization audit — n/a, single call site.
- [x] **Step 6: Commit** — `git commit -m "Stop funnelling the star-rating error through review-panel's blocked output (#825)"`
- [x] **Step 7:** Update execution status.

---

## Phase 2 — `BookingView` drops the dead routing

**Files:** Modify `frontend/src/app/booking/booking-view.ts` · Test `frontend/src/app/booking/booking-view.spec.ts`

- [x] **Step 1:** Update the "refuses to submit with no star picked" test to assert the inline error shows and `#review-result` stays empty — red (still asserts the old routing).
- [x] **Step 2:** Run `npm test -- booking-view` → FAIL.
- [x] **Step 3:** Remove the `(blocked)="blockReview($event)"` binding and the now-dead `blockReview()` method.
- [x] **Step 4:** Run `npm test -- booking-view` → PASS, then its `*.a11y.spec.ts`/`*.contrast.spec.ts`.
- [x] **Step 5:** Generalization audit — n/a.
- [x] **Step 6: Commit** — `git commit -m "Remove the dead blocked-review routing from BookingView (#825)"`
- [x] **Step 7:** Update execution status.

---

## Phase 3 — e2e + close-out

**Files:** Modify `frontend/e2e/review-a-stay.e2e.ts` · `docs/plans/field-error-aria-association.md`

- [x] **Step 1:** Add the AC-5 case to `review-a-stay.e2e.ts`: submit with no star picked, assert `toHaveAccessibleDescription` on the radiogroup and `aria-invalid="true"`.
- [x] **Step 2:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- review-a-stay`.
- [x] **Step 3:** Annotate OQ-2's row in `field-error-aria-association.md` to its resolution (closed by #825).
- [x] **Step 4: Commit** — `git commit -m "Cover the star-rating inline error in the mocked e2e suite and close out OQ-2 (#825)"`
- [x] **Step 5:** Finalize execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | phase 0 | Every component implementing `FormValueControl` (the mechanism `[formField]` auto-wires `invalid`/`errors` into) | `grep -rl "FormValueControl" frontend/src/app` | 1 (`star-rating.ts` itself) | No sibling site to widen; the pattern is new to the codebase, so nothing else needed a matching sweep |
| 2026-08-31 | plan | Every producer/consumer of `ReviewPanel.blocked`, before deleting it | `grep -rn "blocked\b" frontend/src/app/booking` | 1 producer (`review-panel.ts` `send()`), 1 consumer (`booking-view.ts`'s binding + `blockReview()`) | Both removed together in phases 1–2; no orphaned reference left |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3, AC-6 (unit half):** `star-rating.spec.ts` — **18 passed** at `74dfb80`,
  including the three new `describe('the inline required error', …)` cases and a fourth
  axe check with the error showing.
- [x] **AC-4:** `review-panel.spec.ts` — **26 passed** and `booking-view.spec.ts` —
  **78 passed**, both at `f3ecba0`.
- [x] **AC-5, AC-6 (e2e half):** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx
  playwright test --config=playwright.a11y.config.ts review-a-stay` → **5 passed**,
  including `an unrated submit describes the radiogroup itself to assistive technology`.
- [x] **Regression:** `npx ng test --watch=false --include="src/app/booking/**/*.spec.ts"
  --include="src/app/shared/**/*.spec.ts"` → **762 passed** across 77 files.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — vacuous, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6); booking codes untouched (invariant #7).
- [x] No Flyway migration needed (invariant #12); no venue-scoped authorization change (invariant #13).
- [x] **Frontend** standards met: `shared/` placement unchanged, `input()` API, no new SCSS.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green with this doc staged.
- [x] `npm run lint` and `npm run format:check` green over `src` and `e2e`.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows (R-3 is open but not stale — it's a stated,
  reasoned residual, not a forgotten item); Open Questions empty.
- [x] **Close-out written in this session's own commits** — no PR exists for this branch
  (by this session's operating instructions, not by omission), so there is nothing to cite
  as "merged via PR #NN"; the branch `claude/sdlc-825-25yipe` carries all phases green.
- [ ] **The review gate ran in full.** **Not run in this session** — no PR was opened
  (see Execution status), so the `/code-review` invocation ladder was never reached. This
  box is deliberately left unticked rather than substituted with a self-review.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
