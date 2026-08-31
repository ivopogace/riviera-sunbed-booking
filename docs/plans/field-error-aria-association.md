# Inline Field-Error ARIA Association Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every inline field error in the SPA is reachable from its own control — the
control carries `aria-describedby` pointing at the error while (and only while) the error
is showing, plus `aria-invalid="true"` — so a screen-reader user who tabs back to a bad
field hears why it is bad, not just its label.

**Architecture:** One shared attribute directive, `[appFieldErrorFor]`, applied to the
**error element** and taking the control's template reference. The directive owns id
generation, merges its token into any `aria-describedby` the control already has, and sets
`aria-invalid`; because it lives inside the same `@if` that renders the error, its lifetime
*is* the error's lifetime, which makes a dangling `aria-describedby` structurally
impossible rather than merely tested-for. That property is the whole reason for the shape:
a dangling reference is invisible to this repo's CI (see R-1).

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariant #1
and #12 untouched).

**Source of intent:** GitHub issue #821 · raised at the review gate of #812 (PR #819,
finding F-13) · findings register in `docs/plans/reviews-s2-comment-lifecycle.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — corrected the
issue's own inventory: the errors are **not** all `data-testid="*-error"` spans, and the
count is 17 field-scoped, not "~24") · `riviera-plan-doc` (this template — forced the
scope-exclusion table and the risk register that surfaced R-1) · `tdd` (directive built
red-green in phase 0; each application phase pins the association in the touched
component's existing spec before the template edit) · `riviera-review-overlay` (review gate
— due at ready-for-review; RV-FE-E2E decided the e2e suite) · `riviera-docs-freshness`
(ran pre-merge over `origin/main...HEAD` at the review-gate fix round: the rename grep found the
stale F-13 deferral, F-4; the counting sweep found no falsified count, but caught that the overlay
SKILL.md enumerates the FE bank items and so needed RV-FE-11 adding beside the reference file) · `riviera-frontend` (placement: the directive is
a pure, stateless presentational primitive → `shared/`, not `core/`; mocked-a11y e2e suite)
· `riviera-tailwind` (rule 1 — a thing that only adds *attributes* to an element that
already exists is a directive, not a component; and the no-visual-drift rule is why
`aria-invalid` ships unstyled) · `angular-developer` + angular-cli MCP `search_documentation`
(v22: confirmed Signal Forms ships **no** ARIA wiring, and that Angular's own docs show
only `[attr.aria-invalid]`; `effect` + `onCleanup` is the sanctioned shape for syncing
signal state to an imperative DOM API) · `playwright-cli` (the mocked-suite assertion is
`toHaveAccessibleDescription`, which exercises the real Chromium accname computation that
jsdom cannot) · `riviera-local-debug` (implement session — the scoped-test recipe every phase
ran under, and the `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` the mocked e2e config
needs in a cloud session).

**Branch:** `claude/sdlc-821-field-error-aria-b76fq0` — **cloud-session substitution** for the
`bugfix/field-error-aria-association` this plan would otherwise name (`riviera-sdlc`
§Remote/cloud addendum). The implement session was assigned this branch rather than the
plan branch `claude/sdlc-821-plan-review-1f80bm`, so it was created **from** that branch
(fast-forward onto the plan commit `cbdc5f7`), not from `main` — which is what carries the
plan doc into the implementation. `claude/sdlc-821-plan-review-1f80bm` remains as the plan's
own branch and is an ancestor of this one.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC.

- [x] **AC-1:** Given a control and an error element carrying `[appFieldErrorFor]="ctl"`, when the error element is rendered, then the control's `aria-describedby` contains the error element's generated id and the control has `aria-invalid="true"`. *Pinned by:* `field-error-for.spec.ts` › `associates the error with its control while the error is showing`
- [x] **AC-2:** Given that association, when the error element is removed from the DOM, then the control's `aria-describedby` no longer contains the id (and the attribute is dropped entirely when no tokens remain) and `aria-invalid` is removed. *Pinned by:* `field-error-for.spec.ts` › `releases the association when the error goes away`
- [x] **AC-3:** Given a control that already carries `aria-describedby="hint-id"`, when its error renders, then `aria-describedby` is exactly `"hint-id <error-id>"` — pre-existing tokens first, the error last — and on removal it returns to exactly `"hint-id"`. *Pinned by:* `field-error-for.spec.ts` › `appends after an existing description and restores it` **and** `admin-privacy.spec.ts` › `describes the email field by its intro and its error, in that order`
- [x] **AC-4:** Given the booking surfaces with a failing field, when the error shows, then each control names its error via `aria-describedby`. *Pinned by:* `review-panel.spec.ts` › `describes the comment and display-name fields by their errors`, `booking-dialog.spec.ts` › `describes each guest-contact field by its error`
- [x] **AC-5:** Given the operator surfaces with a failing field, when the error shows, then each control names its error via `aria-describedby` — including the two `@for`-scoped errors, where the association is per row and never crosses rows. *Pinned by:* `venue-create-card.spec.ts`, `venue-tab.spec.ts`, `booking-cutoff-field.spec.ts`, `pricing-tab.spec.ts` › `describes only the failing row's price input`, `layout-editor.spec.ts` › `describes only the failing row's name input`
- [x] **AC-6:** Given the review form in a real browser, when it is submitted with a **blank display name**, then that control's **accessible description** equals the error text. *Pinned by:* `e2e/review-a-stay.e2e.ts` › `a rejected field describes itself to assistive technology`. **Deviation from the plan as written, forced by the browser:** the AC originally named a *too-long comment*, which is unreachable in a real browser — `[formField]` projects the `maxLength` validator onto the native `maxlength` attribute, so Chromium truncates the paste at exactly 1000 characters and the field never becomes invalid (the unit spec reaches it only because it assigns `.value` directly, bypassing `maxlength`). The blank required display name is the nearest failure a real guest can actually produce, and it exercises the same accname path
- [x] **AC-8:** Given an error element that reports a failed **write** rather than a bad value, when it renders, then its control is described by it but carries **no** `aria-invalid` — and an error that does blame the value still sets it. *Pinned by:* `field-error-for.spec.ts` › `describes the control without marking its value invalid when told not to`, `pricing-tab.spec.ts` › `describes only the failing row’s price input` (403, not marked) **and** `marks the price invalid only when the server rejected the value itself` (400), `layout-editor.spec.ts` › `describes a refused rename without calling the typed name invalid` (403) **and** `surfaces a taken row name…` (409, marked). Real-browser half: `e2e/operator-pricing.e2e.ts` › `shows the not-owner message and reverts the projection when the reprice is 403`
- [x] **AC-7:** Given every touched surface, when its existing axe spec runs, then it reports no new critical/serious violation. *Pinned by:* the existing `*.a11y.spec.ts` files for the touched components (unchanged assertions, re-run).

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **Error copy, validation rules, and the `submitAttempted()`/`touched()` gating** — #821 is
  association only. Not one message or gate changes.
- **Any visual change.** `aria-invalid` ships **unstyled**. Tailwind v4 has no built-in
  `aria-invalid` variant (its aria shorthands are `busy/checked/disabled/expanded/hidden/
  pressed/readonly/required/selected`), so styling it would mean a fresh
  `aria-[invalid=true]:…` arbitrary variant — a visual change #821 did not ask for, and one
  `riviera-tailwind`'s no-drift rule would make us prove. Deliberately deferred.
- **Form-level and page-level `role="alert"` banners** (~22 sites — `auth-error`,
  `dialog-error`, `batch-error`, `venue-error`, `map-error`, every `admin-*-error` load
  banner, `layout-reload-failed`). They have no single field to describe; WCAG 3.3.1's
  pattern for whole-form failure is a focusable error summary, which is its own slice.
- **`photo-error-{slot}`** (`venue-tab.html:247`) — an upload/remove **action** failure whose
  only visible control is a button (the `<input type="file">` is `class="hidden"` and
  touch-exempt). Describing a hidden input is meaningless and describing a button is the
  action-error pattern, not field validation. Recorded here rather than silently skipped;
  candidate follow-up.
- **`app-star-rating`'s missing inline error.** `required(path.stars)` exists but the panel
  routes `REVIEW_REQUIRED` to a parent result region, so there is no inline field error to
  associate. A real gap, but a *missing message* gap, not an *association* gap. Follow-up
  candidate (see Open questions).
- **`aria-errormessage`.** Considered and rejected — see the Decisions record.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — additive only; no surface is retired or replaced.` Every existing element, class,
`data-testid`, gate and message survives byte-identical; the diff only adds attributes and a
template reference per site. The one behavior that changes is the intended one (AC-1..AC-3).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **A dangling `aria-describedby` is invisible to this repo's CI.** Verified against the installed axe-core 4.12.1: a reference to a missing id is reported as `incomplete`, never a violation — and `src/testing/axe.ts` filters to `critical`/`serious` **violations**, so `expectNoAxeViolations` passes either way. A hand-written binding could rot silently. | high | med | The chosen shape removes the failure mode rather than testing for it: the directive is created and destroyed with the error element, so the token cannot outlive the span. AC-2 pins the release explicitly. | plan | closed — the shape shipped as designed: the directive is created and destroyed with the error element (`field-error-for.spec.ts` › `releases the association when the error goes away`, plus a release assertion at four applied sites). The failure mode is structurally absent, not merely untested |
| R-2 | **`@for`-scoped errors could describe the wrong row.** `pricing-tab` and `layout-editor` render one error inside a loop keyed on the failing row; a mis-scoped template ref would point every row's error at one input. | med | high | The `#ctl` ref is declared **inside** the `@for` body, so it resolves per iteration. AC-5 asserts positively (the failing row is described) *and* negatively (no sibling row is). | plan | closed — **answered: per iteration.** Each `@for` iteration is its own embedded view, so `#priceControl` / `#rowNameControl` resolve within that view only. Pinned both ways: `pricing-tab.spec.ts` › `describes only the failing row’s price input` and `layout-editor.spec.ts` › `describes only the failing row’s name input` each assert the failing row IS described and a sibling row carries neither attribute. Both confirmed failing with the templates reverted, so neither passes vacuously |
| R-3 | **`aria-invalid` clobbering.** The directive both sets and removes `aria-invalid`; a control that carried it for another reason would lose it on error dismissal. | low | low | Verified by grep: no control in `frontend/src/app` sets `aria-invalid` today, so the directive is the sole writer. Stated in the directive's TSDoc so a future second writer is a conscious choice. | plan | closed — re-confirmed on the finished tree: `aria-invalid` appears in `frontend/src/app` only from this directive. The sole-writer claim is stated in its TSDoc |
| R-4 | **Double announcement.** With both `role="alert"` and `aria-describedby`, an error appearing *while its own field has focus* could be spoken twice. | low | low | Structurally unlikely at the 15 Signal-Forms/`touched()` sites: each gate is `submitAttempted()` (focus is on the submit button) or `touched()` (which flips on blur, so focus has already left). Kept as a real-screen-reader check, not a code change — #821 asks for exactly this judgement. See Open questions OQ-1. | plan | closed as **deferred to a human** — no screen reader was available in the implement session, so the live pass OQ-1 needs became **issue #824**. `role="alert"` ships as planned. **Amended at the review gate (F-7):** the "every gate" reasoning above was overstated — it holds for 15 sites but not for site 16, whose `errorRow()` is set from a `(change)` commit on a number input, where Enter commits *without* leaving the field. #824 should target that site specifically |
| R-5 | **In-flight collision.** A concurrent slice editing the same templates would conflict — these 8 files are high-traffic. | low | med | Checked at the intake gate: branch is level with `origin/main`, no open PR touches these files. No Flyway version is claimed (no migration), so the #122/#127 collision class does not apply. Re-check with a merge-from-main before marking the PR ready. | plan | closed — no collision materialized. The branch took the phase commits cleanly and no other PR touched these 8 files; no Flyway version was claimed |
| R-6 | **Touch-target guard false trip.** `scripts/check-touch-target.mjs` fires as a `PostToolUse` hook on edited templates containing `<input>`/`<select>`/`<textarea>`. | low | low | Every touched control already declares `[appTouchTarget]` or a reasoned `data-touch-exempt`; the diff adds no new control. If TT-1/TT-2 fire, that is the build's finding to fix, not a workaround. | plan | closed — `check-touch-target.mjs --diff origin/main` ran green before every push. The diff adds no control, and spec fixtures are out of the guard’s scope by design |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

`None open.` All three entries resolved — see Resolved, below.

### Resolved

- **OQ-1 — deferred to a human, with an issue.** Does keeping `role="alert"` alongside the
  new association double-announce on a real screen reader? Documentation says the two are
  complementary (ARIA19 announces on appearance; the description is read on focus) and R-4's
  gating analysis says the two moments never coincide here — every site gates on
  `submitAttempted()` (focus is on the submit button) or `touched()` (focus has already left).
  No screen reader was available in the implement session, so the maintainer chose the
  follow-up route the plan prescribes: **issue #824**. `role="alert"` ships as planned; the
  slice does **not** claim the question is answered.
- **OQ-2 — follow-up issue filed, and discharged.** `app-star-rating`'s missing inline error is
  a real gap but a *missing message* one, not an *association* one — there is no error element
  to associate. The maintainer chose to track it: **issue #825**. **Discharged by #825**: the
  component now declares `FormValueControl`'s optional `invalid`/`errors` inputs (auto-wired by
  the `Field` directive) plus its own `submitAttempted` gate, and renders an inline
  `[appFieldErrorFor]`-associated error on its `role="radiogroup"` element — never an individual
  radio. The parent-result-region routing (`ReviewPanel.blocked` → `BookingView.blockReview()`)
  is retired rather than kept alongside it, per this issue's own steer against duplicating one
  message in two places.
- **Assumption — held.** Every one of the 17 sites kept its current gating expression, so the
  directive never needs to know *why* an error is showing, only that it is. Confirmed across
  all 17 as they were applied; not one gate, message or validation rule changed.
- **Scope.** Three classes of `role="alert"` exist, not one. Settled with the maintainer:
  **all 17 field-scoped errors**, both Signal-Forms and hand-rolled. Rejected: 14
  (Signal-Forms only — would leave associated and unassociated errors side by side in
  `venue-tab.html`) and ~39 (all alerts — banners have no field referent).
- **Mechanism.** Settled with the maintainer: **directive on the error element**. Rejected:
  a directive on the control reading `FORM_FIELD` (duplicates the template's visibility
  gate — two sources of truth for one boolean — and cannot serve the 3 hand-rolled sites),
  and a documented convention with hand-written bindings (17 chances at a mistake CI cannot
  see, per R-1).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No booking, beach-map or `availability` code is in
scope; the slice adds ARIA attributes to error elements already on screen. `booking-dialog`
is touched, but only its three guest-contact field errors — no reserve path, no claim, no
`(set, date)` write.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` changes.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money, no Stripe, no ledger. `booking-pay.ts` is *not*
touched: its `pay-error` is a form-level banner, excluded by Non-goals.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/field-error-for.ts` | **new** | standalone attribute directive | `input.required<HTMLElement>()` + one `effect` with `onCleanup` | form-agnostic by design |
| FE-2 | `booking/review-panel.ts` | existing | component (inline template) | unchanged | Signal Forms |
| FE-3 | `booking/booking-dialog.ts` | existing | component (inline template) | unchanged | Signal Forms |
| FE-4 | `operator/venue-create-card.{ts,html}` | existing | component | unchanged | Signal Forms |
| FE-5 | `operator/venue-tab.{ts,html}` | existing | component | unchanged | Signal Forms + one hand-rolled field |
| FE-6 | `operator/booking-cutoff-field.ts` | existing | shared field component | unchanged | Signal Forms |
| FE-7 | `operator/pricing-tab.{ts,html}` | existing | component | unchanged | hand-rolled, `@for`-scoped |
| FE-8 | `operator/layout-editor.{ts,html}` | existing | component | unchanged | hand-rolled, `@for`-scoped |
| FE-9 | `admin/admin-privacy.ts` | existing | component (inline template) | unchanged | Signal Forms + a static hint id |

**Standards:** standalone, `input()` signal API, host bindings in the `host` object (never
`@HostBinding`), `@if`/`@for`, no `standalone: true`, no explicit `OnPush`. The directive's
one `effect` is the sanctioned use — syncing signal state to an imperative DOM API — not
state propagation. Styling: no new classes, so `riviera-tailwind` has nothing to migrate;
the touched files carry no SCSS (none remains in-tree), so migrate-on-touch does not fire.

### Why a directive at all, and why on the error element

`[formField]` (Angular 22.0.7, read from the installed source) binds value, disabled,
required, min/max, name, readonly and CSS classes — and **no ARIA**, not even
`aria-invalid`. Angular's own Signal Forms guides render errors as a bare `<p>`. So there is
no framework association to adopt; the W3C techniques are the specification we implement:
`aria-describedby` associates (WAI Forms Tutorial · User Notification), `aria-invalid="true"`
marks the failed state and only after validation has run (ARIA21), `role="alert"` announces
on appearance (ARIA19). All three, together.

Two facts measured rather than assumed, both of which shape the design:

1. **The issue's premise is confirmed.** In real Chromium (CDP `Accessibility.getPartialAXTree`),
   an input in a wrapping `<label>` gets plain trailing text folded into its accessible name
   (`"Phone Plain trailing text."`), but a `role="alert"` sibling contributes **nothing** —
   name `"Name"`, description `null`. The field really is silent on re-focus.
2. **`aria-describedby` announcement order follows the attribute's token order, not DOM
   order** — `aria-describedby="err hint"` with the hint first in the DOM reads back as
   `"Error text. Hint text."`. So AC-3's "hint first, error last" is an orderable requirement
   the directive satisfies by *appending*.

### Directive sketch

```ts
let nextFieldErrorId = 0;

/**
 * Associates an inline field error with the control it belongs to: while this element is in the
 * DOM, the control names it through `aria-describedby` and carries `aria-invalid="true"`.
 *
 * Applied to the ERROR element, taking the control's template reference, so the association's
 * lifetime is the error's own — `@if` removing the error removes the reference with it, and a
 * stale `aria-describedby` cannot be written. A dangling reference is only an axe *incomplete*,
 * which `expectNoAxeViolations` does not fail on, so this is structure rather than a test.
 *
 * The directive is the sole writer of `aria-invalid` in this app; pre-existing `aria-describedby`
 * tokens are preserved and kept first, so a hint reads before the error.
 */
@Directive({
  selector: '[appFieldErrorFor]',
  host: { '[attr.id]': 'id' },
})
export class FieldErrorFor {
  readonly control = input.required<HTMLElement>({ alias: 'appFieldErrorFor' });

  protected readonly id = `riv-field-error-${(nextFieldErrorId += 1)}`;

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const before = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', before ? `${before} ${this.id}` : this.id);
      control.setAttribute('aria-invalid', 'true');
      onCleanup(() => {
        const rest = (control.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter((token) => token && token !== this.id);
        if (rest.length) {
          control.setAttribute('aria-describedby', rest.join(' '));
        } else {
          control.removeAttribute('aria-describedby');
        }
        control.removeAttribute('aria-invalid');
      });
    });
  }
}
```

> **One line of the sketch below did not survive contact with the Sonar gate.** The id
> generator shipped as a `nextFieldErrorElementId()` helper rather than the inline
> `` `riv-field-error-${(nextFieldErrorId += 1)}` ``, because a nested assignment inside a
> template-literal expression is `typescript:S1121` (finding F-1). Behaviour is unchanged;
> everything else below shipped exactly as written.

**This sketch is verified, not proposed.** It was written to
`src/app/shared/field-error-for.{ts,spec.ts}` at plan time, run with
`npx ng test --watch=false --include="src/app/shared/field-error-for.spec.ts"` → **3 passed**
(AC-1, AC-2 and AC-3 exactly as worded), then reverted so this slice starts from a clean
tree. Two facts that cost nothing now and would have cost the implement session time:
`fixture.detectChanges()` alone flushes the effect — no `whenStable()` needed — and the
`onCleanup` really does fire when `@if` tears the embedded view down, which is the single
assumption the whole mechanism rests on.

Call-site shape — two edits per site, a `#ctl` ref on the control and the attribute on the error:

```html
<label [class]="cls.field">
  <span [class]="cls.fieldLabel">Your comment (optional)</span>
  <textarea #commentControl [formField]="reviewForm.comment" data-testid="review-comment"></textarea>
  @if (submitAttempted() && reviewForm.comment().errors().length) {
    <span
      [appFieldErrorFor]="commentControl"
      [class]="cls.fieldError"
      role="alert"
      data-testid="review-comment-error"
      >{{ reviewForm.comment().errors()[0].message }}</span
    >
  }
</label>
```

### The 17 sites

**A — Signal-Forms field errors (14).** Gate in brackets.

| # | Site | Control | Gate |
|---|---|---|---|
| 1 | `booking/review-panel.ts:243` | `review-comment` textarea | `submitAttempted()` |
| 2 | `booking/review-panel.ts:261` | `review-display-name` | `submitAttempted()` |
| 3 | `booking/booking-dialog.ts:161` | full name (no testid) | `submitAttempted()` |
| 4 | `booking/booking-dialog.ts:182` | email (no testid) | `submitAttempted()` |
| 5 | `booking/booking-dialog.ts:203` | phone (no testid) | `submitAttempted()` |
| 6 | `operator/venue-create-card.html:38` | `venue-create-name` | `touched()` |
| 7 | `operator/venue-create-card.html:55` | `venue-create-beach` | `touched()` |
| 8 | `operator/venue-create-card.html:70` | `venue-create-region` | `touched()` |
| 9 | `operator/venue-create-card.html:106` | `venue-create-currency` | `touched()` |
| 10 | `operator/venue-tab.html:40` | venue name | `touched()` |
| 11 | `operator/venue-tab.html:57` | venue beach | `touched()` |
| 12 | `operator/venue-tab.html:72` | venue region | `touched()` |
| 13 | `operator/booking-cutoff-field.ts:33` | the `type="time"` input | `touched()` |
| 14 | `admin/admin-privacy.ts:102` | `admin-privacy-email` — **already has `aria-describedby="admin-privacy-erase-intro"`** | `reviewAttempted()` |

**B — hand-rolled field-scoped errors (3).**

| # | Site | Control | Gate |
|---|---|---|---|
| 15 | `operator/venue-tab.html:302` | `venue-distance` | `distanceError()` |
| 16 | `operator/pricing-tab.html:54` | `pricing-input-{label}`, inside `@for` | `errorRow().label === row.label` |
| 17 | `operator/layout-editor.html:193` | `layout-row-name`, inside `@for` | `rowNameError().y === y` |

Site 13 is worth noting: `booking-cutoff-field` is a shared component that owns its label,
input and error, so fixing it once fixes every call site with no call-site edit.
Sites 14, 16 and 17 are the three interesting ones (existing-hint composition, and the two
`@for` scopes) — they get their own assertions per AC-3 and AC-5.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `merged — the review gate ran in full, its seven findings (F-2..F-8) are fixed
and verified, and the close-out is complete`.

The **Review gate** ran per `riviera-sdlc` `references/pr-gates.md` §1 at **rung 1** of the
invocation ladder — the `Skill("code-review")` probe succeeded, so `/code-review 823 high`
ran its five-agent fan-out, with `riviera-review-overlay` layered on top for the RV-FE/RV-PROC
bank. Not a degraded mode; both halves ran. Findings F-2..F-8 below; each re-entered at
Implement with the routing gate run first.

Two review-gate results worth keeping, because both cost real time to establish:

- **Sonar was verified, not assumed.** The reported list was pulled from the API rather than
  read off the gate's badge: `new_lines` **177** (so the analysis exists — not the false-clean
  read `pr-gates.md` §2 warns about), 0 issues, 0 duplicated blocks, 97.96% new-code coverage.
- **Two of the five review agents reported a 14-site defect that does not exist** — that the
  error text folds into the control's accessible *name*, making the association a double read.
  Both had measured **Playwright's `ariaSnapshot`/`toHaveAccessibleName`**, which is Playwright's
  own JS reimplementation of accname. Chromium's real AX tree (CDP
  `Accessibility.getPartialAXTree`) disagrees on exactly this shape: `role="alert"` inside a
  wrapping `<label>` contributes **nothing** to the name, while a plain `<span>` does. The plan's
  measured fact 1 was right and the finding was rejected. Recorded in **RV-FE-11** so the next
  reviewer does not re-derive it — and note the fix those agents proposed (asserting
  `toHaveAccessibleName`) would have failed against a correct page.

One qualifier on that: SonarCloud analyses every PR push on its own, so its bot posted a
result without the gate being *run* here. It reported Quality Gate **passed** but **1 new
issue**, which is above this repo's 0-new-issues merge bar. The finding was in this slice's
own new code; the maintainer was asked and explicitly directed the fix, so it was taken —
recorded as **F-1** below. That is the whole of the Sonar work done here; triaging the gate
proper is still the maintainer's.

**The fix round cleared the loop on head `f4763b3`:** CI green on all 8 checks, and the Sonar
list pulled from the API (not read off the badge) — `new_lines` **219**, up from 177, so the
analysis is of this diff rather than a stale or unanalyzed read; 0 bugs / vulnerabilities / code
smells / hotspots, 0 duplicated blocks, **98.36%** new-code coverage.

**Merged via PR #823.** The maintainer lifted the draft hold and instructed "merge if green"; the
close-out below was written into this PR's own last commit, before the merge, per `pr-gates.md` §3
step 4. Deferred findings propagated: **#824** (OQ-1, amended with F-7's correction and a second
pass over site 16), **#825** (OQ-2, noting the convention's new `appFieldErrorForInvalidValue`
half), **#826** (the `admin-commissions` gap this slice's audit log had pointed at the wrong home).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the `FieldErrorFor` directive (red → green) | ✅ | `60fe74b` |
| 1 — booking surfaces (sites 1–5) | ✅ | `4512d36` |
| 2 — operator surfaces (sites 6–13, 15–17) | ✅ | `ec76ee0` |
| 3 — admin site 14, e2e, convention note, close-out | ✅ | `5121aa9`, then `3b91273` + `fb5542d` (plan-doc precision) |
| 4 — review-gate fix round (F-2..F-8) | ✅ | see the findings register |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar bot (PR #823, analysed at head `ec76ee0`) | `typescript:S1121` MAJOR at `field-error-for.ts:24` — "Extract the assignment of `nextFieldErrorId` from this expression". The plan's verified sketch generated the id as `` `riv-field-error-${(nextFieldErrorId += 1)}` ``, an assignment nested inside a template-literal expression. The Quality Gate *passed* (1 new issue), but this repo's merge bar is **0 new issues**, so it was above the bar | **fixed** — extracted into a `nextFieldErrorElementId()` helper that increments then returns. Behaviour is identical: ids stay unique, monotonic and the same shape, and no call site moves. Re-entered at Implement per the `riviera-sdlc` re-entry rule (routing gate: `riviera-frontend` — the directive stays in `shared/`, nothing moves; `angular-developer` + `frontend/.claude/CLAUDE.md`; `tdd`). Re-verified: `field-error-for.spec.ts`, `admin-privacy.spec.ts`, `review-panel.spec.ts`, `pricing-tab.spec.ts` — **67 passed**. Fixed in `d6a1649` |
| F-2 | review gate (`/code-review` agents 1 + 3, confirmed independently) | **`aria-invalid="true"` asserted for failures that are not value problems**, at sites 16–17. `RepriceErrorCode`/`RowNameErrorCode` are dominated by write outcomes (`NOT_VENUE_OWNER`, `NO_SUCH_ROW`, `NO_SUCH_VENUE`, `UNAUTHORIZED`, `UNKNOWN`); only `INVALID_REQUEST` — and, for renames, `ROW_NAME_TAKEN` — blames the entered value. Sharpest at `pricing-tab.ts:179`, which **reverts the row to the server's own price** before setting the error, so the input displayed a known-good value while announcing it invalid and describing it as *"Your session has expired."* The slice applied its own distinction inconsistently: Non-goals excludes `photo-error-{slot}` for exactly this reason. `pricing-tab.spec.ts` pinned the wrong semantics, flushing a **403** and asserting `aria-invalid === 'true'` | **fixed** — the directive gained an `appFieldErrorForInvalidValue` input (default `true`; named for the selector rather than aliased, per `busy-action.ts`'s `appBusy` and `@angular-eslint/no-input-rename`), read inside the effect and guarding both the set and the cleanup removal, so `aria-invalid` stays this directive's alone. Both loop sites bind it to a per-code predicate (`valueIsInvalid` / `rowNameValueIsInvalid`) rather than a constant, so a genuinely bad value is still marked. Pinned by AC-8 in both directions. Routing gate: `riviera-frontend` (directive stays in `shared/`, nothing moves) · `angular-developer` (v22 `input()` with a default) · `tdd` (red → green per site) |
| F-3 | review gate (agent 5) | **The added convention condemns a site shipped in the same file.** `frontend/.claude/CLAUDE.md` carved out only *"Form- and page-level banners"*, but `venue-tab.html:256` (`photo-error-{slot}`) is **action**-scoped — a third class, in a file this PR edits, deliberately shipped without the directive. The bullet also never mentioned `aria-invalid` at all, which is the half carrying F-2's hazard | **fixed** — the carve-out now reads "Form-, page- and **action**-level", names both excluded examples, states the ARIA21 rule and the `[appFieldErrorForInvalidValue]="false"` escape, and cites RV-FE-11. Also corrected *"lives and dies inside the same `@if`"*, which did not describe the two `@for` sites' nested shape |
| F-4 | review gate (agent 3; found independently in the docs-freshness sweep) | **The deferral this slice discharges was left stale.** `docs/plans/reviews-s2-comment-lifecycle.md:450` (F-13, from PR #819) still read *"deferred — follow-up #821"* and *"all 24 inline field errors do it this way and none associates"* — both false once this ships, and in a file no amount of reviewing the diff would surface | **fixed** — the row is annotated to its resolution (closed by #821 / PR #823, 17 sites, and why "24" was an over-count) without rewriting the historical finding, per the `riviera-docs-freshness` scope rule and the `focus-guard-hardening` / `focus-surface-scoping` precedent. Routing gate: `riviera-docs-freshness` |
| F-5 | review gate (agents 1 + 3) | **A new a11y convention shipped with no bank item and no guard.** Both prior a11y classes got one (RV-FE-9 for #621, RV-FE-10 for #741); this one landed only in `frontend/.claude/CLAUDE.md`, inserted directly above the *"Guards enforce these while you type"* bullet — while R-1 records that CI is structurally blind to a missing or dangling association | **fixed** — added **RV-FE-11** to `riviera-review-overlay`'s `references/frontend-conventions.md` (six gate checks, follow-up, severity, skill framing) and extended the enumeration in its `SKILL.md`, which the counting sweep flagged would otherwise go stale. The item states plainly that nothing machine-checks it, and carries the Playwright-vs-CDP accname trap |
| F-6 | review gate (agents 2 + 3, both with reproductions) | **Three real limitations absent from the directive's TSDoc.** `aria-invalid` removal is not reference-counted (two errors on one control: the first to unmount clears the mark while the other still shows — reproduced, no current call site); "pre-existing tokens are preserved" holds only for a **static** attribute, not an `[attr.aria-describedby]` binding (`auth-page.ts:220` is the app's only one); and ids are process-monotonic under `isolate: false`, so a literal id is not reproducible | **fixed (documented, not refcounted)** — all three stated in the TSDoc. Refcounting was deliberately *not* built: no control carries two error elements, and R-3 set the precedent that a sole-writer property is held by a written-down constraint rather than speculative machinery. The note says to refcount if that shape ever arrives. The `isolate: false` half mirrors what `freeze-clock.ts` already carries (ADR-0014) |
| F-7 | review gate (this session) | **The plan overstated two things.** Phase 2's steps 1–2 were ticked as *"— red"* / *"→ FAIL"* when the phase was built green-first; and R-4's *"every gate is `submitAttempted()`… or `touched()`, so focus has already left"* is false for site 16, whose `(change)` commit on a number input fires on Enter without leaving the field — and that claim is the stated basis for deferring OQ-1 | **fixed** — phase 2 step 2 now records what actually happened and what the stash-and-rerun recovery does and does not buy; R-4 is scoped to the 15 sites where it holds and amended for site 16, which #824 should target. The recovery itself was judged **adequate** and re-verified independently at the gate |
| F-8 | review gate (agent 2, mutation-tested) | **Three release assertions passed with the feature reverted.** `field-error-for.spec.ts` › `releases the association when the error goes away`, `booking-dialog.spec.ts` › `stops describing…once they are valid`, and `review-panel.spec.ts` › `stops describing a field once its error is corrected` asserted only *absence*, which is trivially true when nothing was ever written — so AC-2, the criterion R-1 calls the whole point of the design, was pinned one-directionally at three of its six sites | **fixed** — each now pins the **take** before the release, matching the three sites that already did (`admin-privacy`, `booking-cutoff-field`, `venue-tab`). Mutation-verified: with the directive's `effect` removed all three now fail, where before they passed |

---

## File structure

- `docs/plans/field-error-aria-association.md` — this plan
- `frontend/src/app/shared/field-error-for.ts` — the new directive
- `frontend/src/app/shared/field-error-for.spec.ts` — its unit spec (AC-1..AC-3)
- `frontend/src/app/booking/review-panel.ts` — sites 1–2 + `imports`
- `frontend/src/app/booking/review-panel.spec.ts` — AC-4
- `frontend/src/app/booking/booking-dialog.ts` — sites 3–5 + `imports`
- `frontend/src/app/booking/booking-dialog.spec.ts` — AC-4
- `frontend/src/app/operator/venue-create-card.html` — sites 6–9
- `frontend/src/app/operator/venue-create-card.ts` — `imports`
- `frontend/src/app/operator/venue-create-card.spec.ts` — AC-5
- `frontend/src/app/operator/venue-tab.html` — sites 10–12, 15
- `frontend/src/app/operator/venue-tab.ts` — `imports`
- `frontend/src/app/operator/venue-tab.spec.ts` — AC-5
- `frontend/src/app/operator/booking-cutoff-field.ts` — site 13 + `imports`
- `frontend/src/app/operator/booking-cutoff-field.spec.ts` — AC-5
- `frontend/src/app/operator/pricing-tab.html` — site 16
- `frontend/src/app/operator/pricing-tab.ts` — `imports`
- `frontend/src/app/operator/pricing-tab.spec.ts` — AC-5, incl. the negative row assertion
- `frontend/src/app/operator/layout-editor.html` — site 17
- `frontend/src/app/operator/layout-editor.ts` — `imports`
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-5, incl. the negative row assertion
- `frontend/src/app/admin/admin-privacy.ts` — site 14 + `imports`
- `frontend/src/app/admin/admin-privacy.spec.ts` — AC-3 composition case
- `frontend/e2e/review-a-stay.e2e.ts` — AC-6
- `frontend/e2e/operator-pricing.e2e.ts` — AC-8's real-browser half (F-2): the 403 case asserts the refusal is described but the reverted price is not marked invalid
- `frontend/.claude/CLAUDE.md` — the convention note #821 asks for (added under Accessibility Requirements; widened by F-3)
- `docs/plans/reviews-s2-comment-lifecycle.md` — F-4: the F-13 deferral this slice discharges, annotated to its resolution
- `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` — F-5: the new RV-FE-11 bank item
- `.claude/skills/riviera-review-overlay/SKILL.md` — F-5: RV-FE-11 added to the frontend-bank enumeration

> Run `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing, with
> this doc staged — the guard short-circuits on an unstaged plan.

---

## Phase 0 — The `FieldErrorFor` directive

**Files:** Create `frontend/src/app/shared/field-error-for.ts` · Test `frontend/src/app/shared/field-error-for.spec.ts`

- [x] **Step 1: Write the failing test** — a host component with a control, a `show` signal, and the error behind `@if`, asserting all three of AC-1, AC-2, AC-3 (including the "attribute dropped entirely when no tokens remain" branch and the pre-existing-hint restore).
- [x] **Step 2: Run it, verify it fails** — `npm test -- field-error-for` → FAIL (module not found, then assertion failures).

> Scope: this one spec file. Not the full suite (`riviera-local-debug`).

- [x] **Step 3: Minimal implementation** — the directive as sketched above.
- [x] **Step 4: Run it, verify it passes** — `npm test -- field-error-for` → PASS.
- [x] **Step 5: Generalization-audit pass** — population `every element in frontend/src/app that renders a field-scoped validation error`; the enumerating command is the one that found the 17, recorded in the audit log below.
- [x] **Step 6: Commit** — `git commit -m "Add a field-error ARIA association directive (#821)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.
- [x] **Step 8: Open the PR as a draft** — CI fires only on the `pull_request` event (#417), so the branch gets no CI until the draft exists. Opened as **draft PR #823**.

---

## Phase 1 — Booking surfaces (sites 1–5)

**Files:** Modify `frontend/src/app/booking/review-panel.ts` · `frontend/src/app/booking/booking-dialog.ts` · Test both `.spec.ts`

- [x] **Step 1:** Extend `review-panel.spec.ts` and `booking-dialog.spec.ts` with AC-4's assertions (describedby present while erroring, absent after) — red.
- [x] **Step 2:** Run `npm test -- review-panel booking-dialog` → FAIL.
- [x] **Step 3:** Add `#ctl` refs and `[appFieldErrorFor]`, and `FieldErrorFor` to each component's `imports`.
- [x] **Step 4:** Run `npm test -- review-panel booking-dialog` → PASS; then the two surfaces' `*.a11y.spec.ts` for AC-7.
- [x] **Step 5:** Generalization audit — n/a for a mechanical application phase; record "no new pattern".
- [x] **Step 6: Commit** — `git commit -m "Associate the booking field errors with their controls (#821)"`
- [x] **Step 7:** Update execution status; check that push's CI run before phase 2. The phase-1 run was green on the backend, the hygiene guards and the full Vitest suite.

---

## Phase 2 — Operator surfaces (sites 6–13, 15–17)

**Files:** Modify `venue-create-card.{ts,html}` · `venue-tab.{ts,html}` · `booking-cutoff-field.ts` · `pricing-tab.{ts,html}` · `layout-editor.{ts,html}` · Test each `.spec.ts`

- [x] **Step 1:** Extend the five specs with AC-5, and for `pricing-tab`/`layout-editor` add the **negative** assertion that a non-failing row's control carries no `aria-describedby`. This is R-2's mitigation and is the phase's real content.
- [x] **Step 2 — built green-first, recovered afterwards (not red-first; recorded honestly rather than ticked as if it had been).** The specs and the templates landed together, so no run observed them red. The recovery was to stash the five templates and re-run: **all six new tests failed**, which is the non-vacuity property red-first exists to buy. Re-verified independently at the review gate — stripping `[appFieldErrorFor]` from both `@for` templates fails exactly the two negative-row tests and nothing else. What the recovery does *not* buy is design pressure on the test, worth little here: phase 2 is a mechanical application of a directive already designed and red-green'd in phase 0.
- [x] **Step 3:** Apply the shape. `booking-cutoff-field` is internal-only (no call-site edit). The two `@for` sites declare `#ctl` inside the loop body.
- [x] **Step 4:** Run the same five → PASS, then their `*.a11y.spec.ts` and `*.contrast.spec.ts` (contrast must be untouched — no class changed).
- [x] **Step 5:** Generalization audit — record the `@for`-scoping question and its answer for both loop sites.
- [x] **Step 6: Commit** — `git commit -m "Associate the operator field errors with their controls (#821)"`
- [x] **Step 7:** Update execution status; check that push's CI run.

---

## Phase 3 — Admin site, e2e, convention, close-out

**Files:** Modify `frontend/src/app/admin/admin-privacy.ts` + `.spec.ts` · `frontend/e2e/review-a-stay.e2e.ts` · `frontend/.claude/CLAUDE.md`

- [x] **Step 1:** `admin-privacy.spec.ts` asserts AC-3's exact composed value `"admin-privacy-erase-intro <error-id>"`, in that order — red.
- [x] **Step 2:** Run `npm test -- admin-privacy` → FAIL.
- [x] **Step 3:** Apply the shape to site 14.
- [x] **Step 4:** Run `npm test -- admin-privacy` → PASS.
- [x] **Step 5:** Add AC-6 to `e2e/review-a-stay.e2e.ts` — submit the review form with an invalid comment, then `await expect(panel.getByTestId('review-comment')).toHaveAccessibleDescription(<the message>)`. This is the only assertion that exercises the real Chromium accname/description computation; jsdom cannot. Run `npm run test:e2e:a11y -- review-a-stay`.
- [x] **Step 6:** Record the convention in `frontend/.claude/CLAUDE.md` under Accessibility Requirements — one entry: an inline field error carries `role="alert"` **and** `[appFieldErrorFor]` naming its control; a hand-written `aria-describedby` for an error is a review finding.
- [x] **Step 7:** Resolve OQ-1 and OQ-2 — a real screen-reader pass on the review form, or a follow-up issue for each.
- [x] **Step 8: Commit** — `git commit -m "Associate the admin erasure field error and pin the convention (#821)"`
- [x] **Step 9 (partial, by instruction):** Execution status finalized in this commit. The PR is **#823** and is **left as a draft** — the maintainer is running the Review and Sonar gates in a separate session, so this session does not mark it ready for review, does not run either gate, and does not write the `merged via` line.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | phase 0 (re-run of the plan's command) | Same population, re-enumerated on the implement branch to confirm the inventory before applying it | (the command in the row below) | **65** `role="alert"` attribute occurrences (69 grep lines − 4 that are prose in TSDoc/HTML comments), not the 39 the row below records — the plan's total was undercounted. The **17 field-scoped sites are unchanged**: every one was confirmed present at its stated `file:line`. The delta is entirely in the excluded class, which is 48, not 22 | Scope unchanged. Two borderline exclusions re-checked and left out on their merits: `layout-editor.html:205` (`layout-row-name-error`, "two rows share a name" — a cross-row constraint naming no single control) and `admin-commissions.ts:211` (`admin-commission-error-*` — a save-action error rendered after the row's buttons, mixing validation and write-failure copy, same class as `venue-create-error`). `admin-commissions.ts:211` was re-examined at the review gate and **filed as #826**: its `editorError()` really does carry a field-validation verdict, so it is a genuine WCAG 3.3.1 gap — but the form-level-summary home suggested here is the wrong one for a per-field error, and the element is never inside an `@if`, so this directive would attach a *permanent* association. **Discharged by #826 (PR #827)**, which split the element in two rather than associating it as-is: the validation verdict became an `@if`-gated field error taking `[appFieldErrorFor]`, the write failure stayed an unassociated action banner keeping the `admin-commission-error-*` testid — so the population is 18 field-scoped as of that merge, and this row's exclusion no longer stands. `layout-editor.html:205` stays excluded on its merits |
| 2026-08-30 | phase 2 (the `@for`-scoping question, R-2) | The two loop-scoped error sites — `pricing-tab` (`pricing-error-{label}`) and `layout-editor` (`layout-row-name-write-error`) — asked whether one template ref inside a `@for` body resolves per iteration or collapses to the last row | Declared `#priceControl` / `#rowNameControl` **inside** the `@for` body, then asserted the negative | 2 sites; both scope per row | **Answered: per iteration.** Each `@for` iteration is its own embedded view, so the ref resolves within that view only. Pinned positively *and* negatively — `pricing-tab.spec.ts` › `describes only the failing row's price input` and `layout-editor.spec.ts` › `describes only the failing row's name input` each assert the failing row is described **and** that a sibling row carries neither `aria-describedby` nor `aria-invalid`. Both tests were confirmed to fail with the templates reverted, so neither passes vacuously |
| 2026-08-30 | plan (pre-phase-0 inventory) | Every element in `frontend/src/app` carrying `role="alert"` — the mechanism, rather than "spans with a `*-error` testid", which is how #821 described it and which **misses 11 of the 17** (sites 3–13: no error element in `booking-dialog`, `venue-create-card`, `venue-tab`'s three Signal-Forms fields, or `booking-cutoff-field` carries a testid at all) | `grep -rn 'role="alert"' frontend/src/app --include=*.ts --include=*.html \| grep -v '\.spec\.'` | 39 total → classified: 17 field-scoped (in scope), 22 form/page-level or action-scoped (Non-goals) | Fix all 17; each exclusion recorded in Non-goals with its reason |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3:** `field-error-for.spec.ts` **4 passed** at `60fe74b` (`associates the error with its control while the error is showing`, `releases the association when the error goes away`, `appends after an existing description and restores it`, `gives each error its own id`). AC-3's shipped composition case: `admin-privacy.spec.ts` › `describes the email field by its intro and its error, in that order` — **19 passed**, red before the template edit with `expected 'admin-privacy-erase-intro' to be 'admin-privacy-erase-intro <id>'`.
- [x] **AC-4:** `review-panel.spec.ts` + `booking-dialog.spec.ts` **47 passed** at `4512d36`; the two association tests were confirmed red first.
- [x] **AC-5:** the five operator specs **134 passed** at `ec76ee0`. All six new tests were confirmed to fail with the templates stashed, so none passes vacuously.
- [x] **AC-6:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts review-a-stay` → **4 passed**. `toHaveAccessibleDescription` is the real-Chromium proof. Retargeted at the display-name field — see the AC for why the comment case is unreachable in a browser.
- [x] **AC-7:** the touched surfaces' axe + contrast specs re-run unchanged — booking **43 passed**, operator **39 passed**, plus `expectNoSeriousAxeViolations` over the review form carrying a rejected field in the e2e. No new violation, and no contrast spec moved (no class changed).
- [x] **AC-8:** added at the review gate (F-2). `field-error-for.spec.ts` › `describes the control without marking its value invalid when told not to` was confirmed red first (a compile error — the input did not exist), then green. Both loop sites pin the distinction in **both** directions: a 403 describes without marking, a 400 `INVALID_REQUEST` / 409 `ROW_NAME_TAKEN` still marks. The two "not marked" assertions were each confirmed red against the pre-fix template, as was the e2e one — reverting the `pricing-tab` binding fails it with the browser reporting `aria-invalid="true"` on the reverted, server-valid €90, which is the defect stated as a rendered fact.
- [x] **Sweep completeness:** `grep -rn appFieldErrorFor frontend/src/app` (excluding specs and the directive itself) returns **exactly 17**, distributed file-for-file as the plan's inventory predicts: admin-privacy 1, booking-dialog 3, review-panel 2, booking-cutoff-field 1, layout-editor 1, pricing-tab 1, venue-create-card 4, venue-tab 4. Every remaining `role="alert"` is on the Non-goals list — including the two borderline exclusions the phase-0 audit re-checked.

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
- [x] **Frontend** standards met: `shared/` placement, `host` object not `@HostBinding`, `input()` API, no new SCSS, no visual drift (`*.contrast.spec.ts` unchanged and passing).
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green with this doc staged.
- [x] `npm run lint` and `npm run format:check` green over `src` and `e2e`.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #823` — written into this PR's last commit, before the merge, so no post-merge repo commit is needed.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`. Ran at **rung 1** (the `Skill("code-review")` probe succeeded), so `/code-review 823 high`'s five-agent fan-out ran with the overlay layered on top — both halves, no degraded mode. Seven findings (F-2..F-8), all fixed; one reported finding rejected on evidence (the accname double-read). The Sonar list was pulled from the API and verified non-empty-analysis. **Re-checked on the fix head `f4763b3`:** CI 8/8 green and the Sonar list clear from the API
(219 new lines analysed, 0 issues, 98.36% coverage). **Still due:** the maintainer's call on whether
the fix round wants a further review pass.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
