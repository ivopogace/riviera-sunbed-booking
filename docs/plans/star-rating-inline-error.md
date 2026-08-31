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

- [ ] **AC-1:** Given the review form with no star picked, when the guest submits, then
  `app-star-rating`'s `role="radiogroup"` element carries `aria-describedby` naming an
  inline error and `aria-invalid="true"`, and the error text is "Pick a star rating."
  *Pinned by:* `star-rating.spec.ts` › `describes itself with the required error once a
  submit is attempted with nothing picked`.
- [ ] **AC-2:** Given that error showing, when a star is then picked, then the error
  element is removed and the radiogroup no longer carries `aria-describedby`/
  `aria-invalid`. *Pinned by:* `star-rating.spec.ts` › `stops describing itself once a
  star is picked`.
- [ ] **AC-3:** Given no submit attempted yet, when the form first renders with nothing
  picked, then no error shows (the field is invalid from the first render, but the gate
  is submit-attempted, matching the comment/display-name fields). *Pinned by:*
  `star-rating.spec.ts` › `shows no error before a submit is attempted`.
- [ ] **AC-4:** Given the review panel, when no star is picked and submit is pressed,
  then nothing is sent, the panel does **not** emit a separate "blocked" event, and the
  booking page's shared result region stays empty — the inline error is the only
  surface. *Pinned by:* `review-panel.spec.ts` › `sends nothing and shows the inline
  error when no star is picked` and `booking-view.spec.ts` › `shows the inline star
  error, not the shared result region, when no star is picked`.
- [ ] **AC-5:** Given a real browser, when the review form is submitted with no star
  picked, then the radiogroup's accessible description equals the rendered error text.
  *Pinned by:* `e2e/review-a-stay.e2e.ts` › `an unrated submit describes the radiogroup
  itself to assistive technology`.
- [ ] **AC-6:** Given the touched surfaces, when their existing axe specs run, then no
  new critical/serious violation is reported. *Pinned by:* `star-rating.spec.ts`'s and
  `review-panel.spec.ts`'s existing `expectNoAxeViolations` calls, re-run with a star
  missing.

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
| R-1 | **`FormValueControl`'s optional `invalid`/`errors` inputs might not be auto-wired the way the docs example shows**, if the installed `@angular/forms/signals` build differs. | low | med | Verified against angular.dev v22 docs via the angular-cli MCP (not training memory, per `frontend/.claude/CLAUDE.md`); `star-rating.spec.ts`'s phase-0 test proves it directly against the installed package, not assumed. | plan | open — closes when phase 0's test passes against the real form |
| R-2 | **Removing the `blocked` output breaks a caller this session didn't find.** | low | low | Grepped: `blocked` has exactly one producer (`review-panel.ts`) and one consumer (`booking-view.ts`'s `(blocked)` binding + `blockReview()`), both touched in this same slice. | plan | closed — confirmed by grep before editing |
| R-3 | **The wrapping `<div>` added around the radiogroup changes `app-star-rating`'s only call site's spacing.** | low | low | `review-panel.ts`'s `<app-star-rating>` line carries no margin classes of its own today; the new wrapper only adds `flex flex-col gap-1.5` for the error's own line, matching the sibling fields' `cls.field` gap. No visual regression expected; `review-panel.contrast.spec.ts` re-run unchanged proves the ink, not the layout — call out in self-review if a screenshot is warranted. | plan | open — re-check visually if the app is run |

## Open questions / Assumptions

- **Assumption:** No other component binds `[formField]` to `app-star-rating` today
  (confirmed by grep — only `review-panel.ts` and `star-rating.spec.ts`), so widening its
  markup carries no other blast radius. — *Owner:* plan · *Resolves by:* phase 0.

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

**Stage pointer:** `implement — phase 1 next`.

**Next action:** wire `[submitAttempted]` down from `review-panel.ts` and drop the `blocked` output.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `StarRating` renders its own inline error (AC-1..AC-3, AC-6) | ✅ | (pending) |
| 1 — `ReviewPanel` wires `submitAttempted` down, drops `blocked` (AC-4) | | |
| 2 — `BookingView` drops the dead `blockReview` routing (AC-4) | | |
| 3 — e2e (AC-5) + close-out | | |

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

- [ ] **Step 1: Write the failing test** — extend `star-rating.spec.ts`'s host to add
  `required(path.stars, { message: 'Pick a star rating.' })` (already present) and a
  `submitAttempted` signal bound to `[submitAttempted]`; assert AC-1..AC-3.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- star-rating` → FAIL (no error element, `invalid`/`errors`/`submitAttempted` inputs don't exist yet).
- [ ] **Step 3: Minimal implementation** — add the three input signals and the `@if` error block, associated via a `#radiogroup` template ref.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- star-rating` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population `every FormValueControl in frontend/src/app` (there is exactly one: `star-rating.ts` itself), so no sibling site exists to sweep. Recorded below.
- [ ] **Step 6: Commit** — `git commit -m "Give app-star-rating its own inline required error (#825)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `ReviewPanel` wires `submitAttempted` down, drops `blocked`

**Files:** Modify `frontend/src/app/booking/review-panel.ts` · Test `frontend/src/app/booking/review-panel.spec.ts`

- [ ] **Step 1:** Update `review-panel.spec.ts`: remove the `blocked` output assertions, add the inline-error assertion for the stars field (mirroring the comment/display-name pattern already in the file) — red.
- [ ] **Step 2:** Run `npm test -- review-panel` → FAIL.
- [ ] **Step 3:** Bind `[submitAttempted]="submitAttempted()"` on `<app-star-rating>`; remove the `blocked` output, its emission in `send()`, and drop `export` from `REVIEW_REQUIRED` (no longer consumed outside the file).
- [ ] **Step 4:** Run `npm test -- review-panel` → PASS, then its `*.contrast.spec.ts`.
- [ ] **Step 5:** Generalization audit — n/a, single call site.
- [ ] **Step 6: Commit** — `git commit -m "Stop funnelling the star-rating error through review-panel's blocked output (#825)"`
- [ ] **Step 7:** Update execution status.

---

## Phase 2 — `BookingView` drops the dead routing

**Files:** Modify `frontend/src/app/booking/booking-view.ts` · Test `frontend/src/app/booking/booking-view.spec.ts`

- [ ] **Step 1:** Update the "refuses to submit with no star picked" test to assert the inline error shows and `#review-result` stays empty — red (still asserts the old routing).
- [ ] **Step 2:** Run `npm test -- booking-view` → FAIL.
- [ ] **Step 3:** Remove the `(blocked)="blockReview($event)"` binding and the now-dead `blockReview()` method.
- [ ] **Step 4:** Run `npm test -- booking-view` → PASS, then its `*.a11y.spec.ts`/`*.contrast.spec.ts`.
- [ ] **Step 5:** Generalization audit — n/a.
- [ ] **Step 6: Commit** — `git commit -m "Remove the dead blocked-review routing from BookingView (#825)"`
- [ ] **Step 7:** Update execution status.

---

## Phase 3 — e2e + close-out

**Files:** Modify `frontend/e2e/review-a-stay.e2e.ts` · `docs/plans/field-error-aria-association.md`

- [ ] **Step 1:** Add the AC-5 case to `review-a-stay.e2e.ts`: submit with no star picked, assert `toHaveAccessibleDescription` on the radiogroup and `aria-invalid="true"`.
- [ ] **Step 2:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- review-a-stay`.
- [ ] **Step 3:** Annotate OQ-2's row in `field-error-aria-association.md` to its resolution (closed by #825).
- [ ] **Step 4: Commit** — `git commit -m "Cover the star-rating inline error in the mocked e2e suite and close out OQ-2 (#825)"`
- [ ] **Step 5:** Finalize execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | phase 0 | Every component implementing `FormValueControl` (the mechanism `[formField]` auto-wires `invalid`/`errors` into) | `grep -rl "FormValueControl" frontend/src/app` | 1 (`star-rating.ts` itself) | No sibling site to widen; the pattern is new to the codebase, so nothing else needed a matching sweep |
| 2026-08-31 | plan | Every producer/consumer of `ReviewPanel.blocked`, before deleting it | `grep -rn "blocked\b" frontend/src/app/booking` | 1 producer (`review-panel.ts` `send()`), 1 consumer (`booking-view.ts`'s binding + `blockReview()`) | Both removed together in phases 1–2; no orphaned reference left |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3:** `star-rating.spec.ts` — to be filled with the commit sha once green.
- [ ] **AC-4:** `review-panel.spec.ts` + `booking-view.spec.ts` — to be filled.
- [ ] **AC-5:** `review-a-stay.e2e.ts` — to be filled.
- [ ] **AC-6:** existing axe specs re-run — to be filled.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — vacuous, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6); booking codes untouched (invariant #7).
- [ ] No Flyway migration needed (invariant #12); no venue-scoped authorization change (invariant #13).
- [ ] **Frontend** standards met: `shared/` placement unchanged, `input()` API, no new SCSS.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` green with this doc staged.
- [ ] `npm run lint` and `npm run format:check` green over `src` and `e2e`.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR/session**, citing how it shipped.
- [ ] **The review gate ran in full**, or its absence is stated honestly.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
