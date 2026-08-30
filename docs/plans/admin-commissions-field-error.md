# Admin Commissions — split the editor error so the rate input names its own validation error

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `admin-commissions`' single always-mounted `editorError()` element into a
**field-validation** error that renders only while it exists and names the rate input through
`[appFieldErrorFor]`, and a **write-failure** action banner that stays alert-only — closing the
WCAG 3.3.1 gap without ever attaching a permanent `aria-describedby`/`aria-invalid`.

**Architecture:** The single most significant decision is **two signals, two elements, two
semantics** — `percentError` (client-side verdict about the typed value → `role="alert"` +
`[appFieldErrorFor]="percentInput"`, default `aria-invalid="true"`) and `saveError` (a failed
`PUT` → `role="alert"` only, no association, per `frontend/.claude/CLAUDE.md`'s action-level-banner
rule and RV-FE-11's fourth checkbox). The directive's whole guarantee is that *its lifetime is the
error's lifetime*, so the validation element must live inside an `@if`; the vertical space today's
element reserves moves to a plain wrapper `<div>`, which is where a layout concern belongs.

**Persistence:** N/A — frontend-only, no table, no migration, no backend call shape change.

**Source of intent:** GitHub issue
[#826](https://github.com/ivopogace/riviera-sunbed-booking/issues/826) (follow-up from the review
gate of #821 / PR #823; recorded as a borderline exclusion in
`docs/plans/field-error-aria-association.md`'s generalization-audit log, row `2026-08-30`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that
`frontend/.claude/CLAUDE.md:49` cites `admin-commission-error-*` as an *action-level banner*
exemplar, so the testid must stay with the **write-failure** half or that line goes stale; also
confirmed no in-flight feature PR and no Flyway number to claim) · `riviera-plan-doc` (this
template — forced the behaviour-parity ledger, which is what caught the reserved-space and the
`role="alert"`-always-mounted parity questions) · `tdd` (each phase is red-first: the take/release
assertion is written before the directive is applied) · `riviera-review-overlay` (review gate — due
at ready-for-review; RV-FE-11 is the bank item this slice is graded on, and its two named traps
drove the `appFieldErrorForInvalidValue` decision and the "assert the take **and** the release"
AC) · `riviera-docs-freshness` (**ran** over the planned diff — 1 finding: the
`admin-commissions.a11y.spec.ts` TSDoc sentence "an alert region that exists before it ever
carries text" is contradicted by this change and is fixed in Phase 1; `frontend/.claude/CLAUDE.md:49`
and `docs/plans/field-error-aria-association.md:506` re-read and confirmed **still accurate**
after the change — see *Docs-freshness ledger*) · `riviera-frontend` (structure: no new file, no
new folder — the change is confined to the `admin/` feature folder; the directive already lives in
`shared/`, so no import-direction question arises) · `riviera-tailwind` (styling: keep
`min-h-[1.25rem]` on the new wrapper rather than the scale form `min-h-5`, and keep the sibling's
`text-[#b3261e]` on the new element rather than the `text-riv-error-ink` token — both to hold the
no-visual-drift hard rule; rationale in *Open questions → Resolved*) · `angular-developer` +
angular-cli MCP (`get_best_practices` for the v22 posture — signals, native control flow, no
`@HostBinding`; `search_documentation` "template reference variable" confirmed the scoping this
plan depends on: *"An inner template can access template variables that the outer template
defines"*, so `#percentInput` declared in the `@if (editingId() === …)` body resolves inside the
nested `@if (percentError())`) · `playwright-cli` (the mocked-suite spec in Phase 1 —
`page.route` interception is already set up in the file; the new test needs no network mock at all,
because the validation path never reaches the wire)

**Branch:** `claude/sdlc-826-plan-review-4mb2zg` — the cloud session's **designated remote branch**
stands in for `bugfix/admin-commissions-field-error` (`riviera-sdlc` § *Remote / cloud session
addendum*). Exists in git and on `origin`.

---

## Acceptance criteria (testable)

> Written at this slice's application boundary: the component's observable DOM/ARIA contract, which
> is what a screen reader and `aria-describedby` actually consume. There is no backend hexagon here.

- [ ] **AC-1:** Given the rate editor is open on venue 7, when the admin saves a percent outside
      0–100 (`101`), then a `role="alert"` element carrying *"Commission must be a percentage
      between 0% and 100%."* is rendered, and `admin-commission-percent-7` has
      `aria-describedby` equal to that element's `id` and `aria-invalid="true"`.
      *Pinned by:* `admin-commissions.spec.ts` › `describes the rate field by its validation error, and releases it once the value is usable`

- [ ] **AC-2:** Given AC-1's state, when the admin types a usable percent (`11`), then the
      validation element is removed from the DOM and `admin-commission-percent-7` carries **neither**
      `aria-describedby` **nor** `aria-invalid`.
      *Pinned by:* the same test (the release half — an absence-only assertion passes when nothing
      was ever written, so take and release are asserted in one test).

- [ ] **AC-3:** Given the admin saves a percent the venue already has (`15`), then the same
      validation element renders *"That is already this venue's rate (1500 bps)."* and the input is
      marked `aria-invalid="true"` — the admin must retype a different value to proceed, so ARIA21's
      "is the entered value wrong?" test answers yes.
      *Pinned by:* `admin-commissions.spec.ts` › `refuses a change that is already the venue's rate`

- [ ] **AC-4:** Given the write fails (`PUT` rejects), then `admin-commission-error-7` renders
      *"Nothing was changed…"* with `role="alert"`, and `admin-commission-percent-7` carries
      **neither** `aria-describedby` **nor** `aria-invalid` — a 500 is not a claim about the typed
      value (RV-FE-11 trap #1).
      *Pinned by:* `admin-commissions.spec.ts` › `keeps the old rate and the typed draft when the write fails`

- [ ] **AC-5:** Given no error of either kind, then **no** `role="alert"` element exists inside the
      open editor, and the input carries no `aria-describedby` — i.e. nothing empty is left mounted.
      *Pinned by:* `admin-commissions.spec.ts` › `mounts no error element while the editor is clean`

- [ ] **AC-6:** In a real browser at 360px, given the admin saves `101`, then the rate input's
      `aria-describedby` resolves to a **present, non-empty** element, and the page has no serious
      axe violations; after typing a usable value the attribute is gone.
      *Pinned by:* `frontend/e2e/admin-commissions.e2e.ts` › `an out-of-range rate names the field it blames, and lets go when corrected`

- [ ] **AC-7:** The open editor's axe audit still passes with the error element **showing**, not
      only when clean.
      *Pinned by:* `admin-commissions.a11y.spec.ts` › `has no axe violations while a rate editor shows a validation error`

## Non-goals

- **No form-level error summary.** #826 explicitly rejects that home: this is a per-field error on
  one input inside a per-row editor, and a summary would not fix it.
- **No Signal Forms migration.** The editor drives plain signals with `(input)` handlers. Converting
  it is a real improvement and entirely separate work.
- **No hint association for `admin-commission-preview-*`.** The bps preview is a genuine hint and
  could reasonably be pulled into `aria-describedby` first (the directive appends and preserves
  order deliberately). Out of scope: #826 is about the *error*, and adding it would change what a
  screen reader reads on every focus, not just on failure.
- **No `#b3261e` → `text-riv-error-ink` token migration.** 18 literal occurrences repo-wide, a
  visible colour change (`#b3261e` → `#a3160e`), and it needs a contrast spec. See
  *Open questions → Resolved OQ-2*; a follow-up issue is proposed at close-out.
- **No commission behaviour change whatsoever** — no arithmetic, no effective-dating, no rate
  schedule, no wire shape. Invariants #5 and #9 are untouched.

## Behavior-parity ledger

> Required: this slice **replaces** an existing surface (one error element becomes two).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `editorError()` shows the out-of-range verdict | **preserved** (moved) | now `percentError()`, rendered under the rate input instead of under the buttons; same copy, byte-for-byte |
| `editorError()` shows the already-this-rate verdict | **preserved** (moved) | same — `percentError()`, same copy |
| `editorError()` shows `messageFor(commissionWriteErrorOf(error))` | **preserved** (in place) | now `saveError()`, same element position (after the buttons) and same testid `admin-commission-error-<venueId>` |
| The error element carries `role="alert"` | **preserved, twice** | both new elements carry it. The live region is now *inserted with its text* rather than *mounted empty and filled*; that is the pattern every other error in this app already uses (`booking-cutoff-field`, `venue-tab`, `review-panel`), and the one `[appFieldErrorFor]` is built for |
| The element is always mounted, reserving `min-h-[1.25rem]` below the buttons | **changed** | the reserve moves to a wrapper `<div class="mt-2 min-h-[1.25rem]">` at the **same position**, so the row's height is unchanged whether or not a write error shows. What is gone is the *empty live region*, which was the defect |
| Typing in the rate field clears the error | **preserved** | `onPercentTyped` clears **both** signals, exactly as it cleared the one |
| Opening / cancelling / closing the editor clears the error | **preserved** | `startEdit` and `closeEditor` clear both |
| A save attempt clears the previous error before the network leg | **preserved** | `saveRate` clears both before `await` |
| A failed write keeps the editor open holding the typed draft and moves focus to Save | **preserved** | untouched — no change to `saveRate`'s focus legs |
| No validation error reserved space of its own near the input | **changed** | a validation error now appears in flow beneath the bps preview, so the Reason field shifts down ~1.25rem while it shows. Deliberate: reserving permanent blank space beside a field that is usually valid is the same "always mounted" smell in a new place, and the editor already expands in place by design |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The template ref `#percentInput` is declared in the `@if (editingId() === venue.venueId)` body but consumed in a **nested** `@if (percentError())` — if inner views could not read outer refs, the binding would be `undefined` at runtime and `input.required` would throw | low | high | angular.dev § *Template reference variables → Accessing in a nested template*: *"An inner template can access template variables that the outer template defines."* Verified via the angular-cli MCP against the v22 index. AC-1 fails loudly (thrown required-input error) if this is ever wrong | agent | open |
| R-2 | `aria-invalid` is **not** reference-counted (the directive's own documented limit). If both errors ever associated with the same input, the first to unmount would clear the mark while the other still shows | low | med | Structural, not a test: `saveError` is deliberately **not** associated. Only one element ever names `admin-commission-percent-*`. AC-4 pins that the write failure leaves the input unmarked | agent | open |
| R-3 | The `@for` loop means one `#percentInput` ref **per embedded view**. A ref leaking across rows would associate venue 9's error with venue 7's input | low | high | Only one editor is open at a time (`editingId()` is a single value), and refs resolve per embedded view (RV-FE-11 checkbox 2). The e2e (AC-6) reads the attribute off row 7's own input by testid | agent | open |
| R-4 | Renaming the validation half's testid silently breaks a spec or e2e that queried the merged element | med | low | Enumerated up front: 4 unit assertions (`admin-commissions.spec.ts:226,250,264,335`) and 1 e2e (`admin-commissions.e2e.ts:182`). Lines 264/335/182 are **write** failures and keep `admin-commission-error-7` unchanged; only 226 and 250 move to `admin-commission-percent-error-7`. Full-repo sweep in Phase 0 step 5 | agent | open |
| R-5 | Moving the reserved space changes the rendered row height and the tab silently starts scrolling sideways at 360px | low | med | The wrapper keeps `mt-2 min-h-[1.25rem]` at the same position, so the closed-error height is byte-identical. The existing e2e `the tab strip … never scrolls sideways at 360px` re-runs unchanged and is the proof | agent | open |
| R-6 | An `@if`-inserted `role="alert"` announces less reliably than a pre-existing live region in some AT | low | med | Accepted, and it is the repo's settled convention: every other field error in this app is `@if`-gated (`booking-cutoff-field.ts`, `venue-tab.html`, `review-panel.ts`, `admin-privacy.ts`, `booking-dialog.ts`). `[appFieldErrorFor]` exists **because** the association is what a screen-reader user hears on re-focus — the alert is the notification, the association is the durable answer | agent | open |
| R-7 | Scope creep into the `#b3261e` → token migration or Signal Forms while touching the file | med | low | Both named in *Non-goals*; OQ-2 records the colour decision with its reason | agent | open |

## Open questions / Assumptions

*(Empty — both questions were settled at plan time against the docs and the code. See Resolved.)*

### Resolved

- **OQ-1 — Does the write-failure half get `[appFieldErrorFor]` with
  `[appFieldErrorForInvalidValue]="false"`, or no association at all?** #826 leaves it open
  ("*if it stays associated at all*"). **Resolved: no association.**
  `frontend/.claude/CLAUDE.md:49` classifies form-, page- and **action**-level banners as
  alert-only and names `admin-commission-error-*` as one of its two exemplars
  (`photo-error-{slot}` being the other); RV-FE-11's fourth checkbox says the same. A failed `PUT`
  is an action outcome, not a field verdict — the message *"Nothing was changed…"* is about the
  request, and there is nothing to retype. Keeping the association off also keeps R-2 impossible
  by construction. Resolved at plan time (this doc).

- **OQ-2 — Does the new error element use `text-riv-error-ink` (the token) or its sibling's
  `text-[#b3261e]` literal?** **Resolved: the literal, matching the sibling.** `riviera-tailwind`
  says components consume tokens, not palette literals — but it also states the no-visual/colour-drift
  rule as the *hard* one, and `--riv-error-ink` resolves to `#a3160e` in porcelain (the theme the
  admin console pins). Using the token on the new element alone would put two different reds in one
  editor; migrating both would be a deliberate colour change on a presentation-only a11y slice,
  needing a contrast proof this plan does not carry. Recorded as a Non-goal with a follow-up issue
  proposed at close-out (18 literal sites repo-wide; no existing issue — searched).

- **OQ-3 — Does the validation error render above or below the bps preview?** **Resolved: below.**
  The preview is the field's hint; `frontend/.claude/CLAUDE.md` and RV-FE-11 checkbox 5 both make
  hint-before-error the announcement order, and hint-then-error is the standard visual order.
  (The preview is not itself in `aria-describedby` today — see Non-goals.)

- **OQ-4 — `min-h-[1.25rem]` or `min-h-5` on the new wrapper?** **Resolved: `min-h-[1.25rem]`.**
  Tailwind v4 docs: `min-h-<number>` → `calc(var(--spacing) * <number>)`; `--spacing` is not
  overridden in `src/tailwind.css`, so the default `0.25rem` makes `min-h-5` **exactly** equivalent.
  But the tree's six reserve-space slots are all arbitrary-value (`min-h-[1.5rem]` ×5,
  `min-h-[1.25rem]` ×2) — introducing the only scale-form one here is drift for nothing, and the
  value is carried over verbatim rather than re-derived. Verified against
  https://tailwindcss.com/docs/min-height (Tailwind 4.3.2).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` row is read or
written, no booking is created or released, and no request is accepted. The slice changes the DOM
of one admin console tab.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No Java changes, no module boundary, no event, no port. The `venue` module
owns the effective-dated commission-rate schedule and is untouched; invariant #9's ledger is
untouched.

### Module ownership (§4a)

`N/A — frontend-only; no backend behavior is added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The rate the editor writes is a commission **rate**, not money moving;
nothing is charged, refunded, or accrued. The wire still carries integer basis points only and this
slice does not touch the request path.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-commissions.ts` | existing | standalone component (inline template) | signals — `editorError` split into `percentError` + `saveError`; `draftBps` `computed()` unchanged | none (plain `(input)` handlers — see Non-goals) |
| FE-2 | `shared/field-error-for.ts` (`FieldErrorFor`) | existing, **consumed** | attribute directive | `input.required<HTMLElement>` + `effect` with `onCleanup` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
no `@HostBinding`/`@HostListener`, no explicit `OnPush` (default in v22), no `ngClass`/`ngStyle`.
Confirmed against the angular-cli MCP's v22 best-practices guide. The one API question this slice
turns on — outer-template-ref visibility from a nested `@if` — was confirmed against angular.dev
(R-1). `FieldErrorFor` must be added to the component's `imports` array.

## FE↔BE contract

`N/A — no contract change.` `GET /api/admin/venues/commissions` and
`PUT /api/admin/venues/{venueId}/commission` are called exactly as today, with the same DTOs and
the same `X-Audit-Reason` header behaviour.

## Docs-freshness ledger

| Doc | Statement checked | Verdict |
|---|---|---|
| `frontend/src/app/admin/admin-commissions.a11y.spec.ts` (TSDoc) | *"…and an alert region that exists before it ever carries text."* | **Contradicted** by the slice — no region is mounted empty any more. Rewritten in Phase 1 |
| `frontend/.claude/CLAUDE.md:49` | *"Form-, page- and action-level banners name no single control and stay alert-only (`photo-error-{slot}`, `admin-commission-error-*`)."* | **Still accurate, and more so** — after the split, `admin-commission-error-*` is a *pure* action banner. Deliberately no edit; the testid is kept on the write-failure half specifically to keep this true |
| `docs/plans/field-error-aria-association.md:506` | The audit-log row excluding `admin-commissions.ts:211` and recording *"filed as #826"* | **Still accurate** — the row states history, and the history does not change. No edit |
| `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` (RV-FE-11) | The bank item and its two traps | **Still accurate** — this slice is an instance of the rule, not a change to it |

---

## File structure

- `docs/plans/admin-commissions-field-error.md` — this plan (guard-exempt)
- `frontend/src/app/admin/admin-commissions.ts` — split `editorError` into `percentError` +
  `saveError`; add `#percentInput` ref, the `@if`-gated associated validation error, and the
  reserving wrapper around the write-failure banner; import `FieldErrorFor`
- `frontend/src/app/admin/admin-commissions.spec.ts` — retarget the two validation assertions,
  add the take/release test, the clean-editor test, and the write-failure-leaves-it-unmarked
  assertion
- `frontend/src/app/admin/admin-commissions.a11y.spec.ts` — add the error-showing axe audit; fix
  the stale TSDoc sentence
- `frontend/e2e/admin-commissions.e2e.ts` — add the real-browser association test (AC-6)

---

## Phase 0 — Split the error, associate the field half

**Files:** Modify `frontend/src/app/admin/admin-commissions.ts:208–214` (template) and
`:328–335, 375–425` (class) · Test `frontend/src/app/admin/admin-commissions.spec.ts`

- [x] **Step 1: Write the failing tests**

```ts
// admin-commissions.spec.ts — new, beside the existing editor tests.

/**
 * The association, both halves. An absence-only assertion passes just as well when nothing was
 * ever written, so the take is asserted before the release (RV-FE-11).
 */
it('describes the rate field by its validation error, and releases it once the value is usable', async () => {
  const service = serviceStub();
  const fixture = await render(authStub(), service);

  await typeRate(fixture, 7, '101');
  await save(fixture, 7);

  const field = byTestId<HTMLInputElement>(fixture, 'admin-commission-percent-7')!;
  const error = byTestId(fixture, 'admin-commission-percent-error-7')!;
  // Ids are process-monotonic and shared across specs in a worker — read it back, never assert a literal.
  expect(field.getAttribute('aria-describedby')).toBe(error.id);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(error.getAttribute('role')).toBe('alert');
  expect(error.textContent).toContain('0%');

  await typeRate(fixture, 7, '11');

  expect(byTestId(fixture, 'admin-commission-percent-error-7')).toBeNull();
  expect(field.hasAttribute('aria-describedby')).toBe(false);
  expect(field.hasAttribute('aria-invalid')).toBe(false);
});

/** Nothing is mounted empty: the defect #826 names is an always-present live region. */
it('mounts no error element while the editor is clean', async () => {
  const fixture = await render(authStub(), serviceStub());

  await typeRate(fixture, 7, '11');

  const editor = byTestId(fixture, 'admin-commission-editor-7')!;
  expect(editor.querySelector('[role="alert"]')).toBeNull();
  expect(
    byTestId<HTMLInputElement>(fixture, 'admin-commission-percent-7')!.hasAttribute(
      'aria-describedby',
    ),
  ).toBe(false);
});
```

```ts
// admin-commissions.spec.ts — retarget the two validation assertions (R-4).
// :226  'refuses a rate outside 0–100% without sending anything'
expect(text(fixture, 'admin-commission-percent-error-7')).toContain('0%');
// :250  "refuses a change that is already the venue's rate"   (AC-3)
expect(text(fixture, 'admin-commission-percent-error-7')).toContain('already');
```

```ts
// admin-commissions.spec.ts — extend 'keeps the old rate and the typed draft when the write fails'
// (:264 keeps its existing testid — the write banner does not move). AC-4, RV-FE-11 trap #1:
// a 500 is not a claim about the typed value.
const field = byTestId<HTMLInputElement>(fixture, 'admin-commission-percent-7')!;
expect(field.hasAttribute('aria-invalid')).toBe(false);
expect(field.hasAttribute('aria-describedby')).toBe(false);
expect(byTestId(fixture, 'admin-commission-percent-error-7')).toBeNull();
```

- [x] **Step 2: Run them, verify they fail** —
      `npm test -- --watch=false --include="src/app/admin/admin-commissions.spec.ts"` → FAIL (4 of 25):
      `admin-commission-percent-error-7` is `null`, and the clean-editor test fails on the
      always-mounted `[role="alert"]`.

> Scope: this ONE spec file. `riviera-local-debug` owns the run recipe; the full Vitest suite is CI's job.

- [x] **Step 3: Minimal implementation**

Class — replace the single `editorError` signal (`admin-commissions.ts:328`) with two, and update
its four writers:

```ts
/**
 * The editor's two error kinds, deliberately separate. `percentError` is a verdict about the value
 * in the rate field — decided here, before anything is sent — so it is rendered as a field error the
 * input names through `[appFieldErrorFor]`, carrying `aria-invalid` because the admin must retype to
 * fix it. `saveError` reports a failed write: the typed value is fine, nothing needs retyping, so it
 * stays an alert-only action banner beside the buttons that produced it (#826; RV-FE-11).
 */
protected readonly percentError = signal('');
protected readonly saveError = signal('');
```

```ts
// startEdit  (was: this.editorError.set(''))
this.percentError.set('');
this.saveError.set('');

// onPercentTyped — typing clears both, exactly as it cleared the one
this.percentError.set('');
this.saveError.set('');

// saveRate
if (commissionBps === null) {
  this.percentError.set('Commission must be a percentage between 0% and 100%.');
  return;
}
if (commissionBps === venue.commissionBps) {
  this.percentError.set(`That is already this venue's rate (${venue.commissionBps} bps).`);
  return;
}
// …
this.busy.set(true);
this.percentError.set('');
this.saveError.set('');
// …
} catch (error) {
  this.saveError.set(messageFor(commissionWriteErrorOf(error)));
```

```ts
// closeEditor — clear both alongside the draft signals
this.percentError.set('');
this.saveError.set('');
```

Template — add the ref, the associated error, and the reserving wrapper:

```html
<!-- the rate input gains a template ref; everything else on it is unchanged -->
<input
  appTouchTarget
  type="number"
  …
  (input)="onPercentTyped($event)"
  class="mt-1 w-full max-w-[160px] rounded-[10px] border border-riv-field-border bg-white/70 px-3 py-2 text-[15px] text-riv-card-ink"
  #percentInput
/>

<p class="mt-2 text-[13px] text-riv-card-ink-soft" [attr.data-testid]="…">…preview, unchanged…</p>

@if (percentError()) {
  <p
    class="mt-2 text-[13.5px] font-semibold text-[#b3261e]"
    role="alert"
    [appFieldErrorFor]="percentInput"
    [attr.data-testid]="'admin-commission-percent-error-' + venue.venueId"
  >
    {{ percentError() }}
  </p>
}
```

```html
<!-- was: an always-mounted <p> holding min-h-[1.25rem]. The reserve is a layout concern, so it
     moves to the wrapper and the banner itself lives only as long as the error does. -->
<div class="mt-2 min-h-[1.25rem]">
  @if (saveError()) {
    <p
      class="text-[13.5px] font-semibold text-[#b3261e]"
      role="alert"
      [attr.data-testid]="'admin-commission-error-' + venue.venueId"
    >
      {{ saveError() }}
    </p>
  }
</div>
```

```ts
// @Component imports — the directive is a peer of the ones already listed
imports: [CardGlass, BusyAction, TouchTarget, FieldErrorFor],
```

- [x] **Step 4: Run them, verify they pass** —
      `npm test -- --watch=false --include="src/app/admin/admin-commissions.spec.ts"` → PASS (25).

> Scope (end-of-phase regression): broaden to the touched folder —
> `npm test -- --watch=false --include="src/app/admin/**/*.spec.ts"` → 23 files / 189 tests PASS.

> **Two things the plan's step text got wrong, corrected in execution — mechanics, not decisions:**
> (1) the runner is `@angular/build:unit-test`, so the invocation is
> `npm test -- --watch=false --include="<glob>"`; `--run <path>` is rejected as an unknown argument.
> (2) the release half of the take/release test cannot call `typeRate` a second time — that helper
> clicks `admin-commission-edit-N`, which is unmounted while the editor is open. The
> type-into-an-open-editor half is extracted as `retypeRate()`, which `typeRate()` now calls, so the
> assertion is unchanged and the helper stays DRY.

- [x] **Step 5: Generalization-audit pass**

Population `every element in the app that renders a field-scoped error message but is mounted
unconditionally — i.e. the mechanism #826 names, an error element whose lifetime is NOT the error's
lifetime` → enumerate with the command below (find every `role="alert"` element, then keep the ones
NOT preceded by a gating `@if`) → judge each. This is the population by **mechanism**, not by
resemblance to `admin-commissions`: `min-h-*` is a symptom, so a search for reserved-space classes
would miss an unconditional error element that happens not to reserve space.

```bash
grep -rn 'role="alert"' frontend/src --include=*.ts --include=*.html
# then, for each hit, check whether the nearest enclosing block is an @if on the message itself:
grep -rn -B 6 'role="alert"' frontend/src --include=*.ts --include=*.html | grep -n '@if\|role="alert"'
```

Record the candidates and the decision in the Generalization-audit log. Expectation to verify, not
assume: #821 swept the 17 field-scoped sites and left 48 excluded — the ones worth re-judging are
any **unconditional** element among those 48 that carries a field verdict, which is exactly how
#826 was found. Anything genuinely form-/page-/action-level stays out on its merits (record why).

- [x] **Step 6: Commit** — `git commit -m "Split the commission editor's error so the rate field names its own (#826)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Prove it in a real browser, and fix the doc the change contradicts

**Files:** Test `frontend/e2e/admin-commissions.e2e.ts` ·
Test `frontend/src/app/admin/admin-commissions.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// admin-commissions.e2e.ts — AC-6. jsdom cannot prove the reference RESOLVES; axe reports a
// dangling aria-describedby as `incomplete`, and expectNoSeriousAxeViolations reads `violations`
// only — so nothing in CI sees a rotted association except an assertion that dereferences it.
// No network mock is needed: the validation refusal never reaches the wire.
test('an out-of-range rate names the field it blames, and lets go when corrected', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);
  await openCommissionsTab(page);

  await page.getByTestId('admin-commission-edit-7').click();
  await page.getByTestId('admin-commission-percent-7').fill('101');
  await page.getByTestId('admin-commission-save-7').click();

  const field = page.getByTestId('admin-commission-percent-7');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(/percentage between 0% and 100%/);
  await expectNoSeriousAxeViolations(page);

  await page.getByTestId('admin-commission-percent-7').fill('11');

  await expect(field).not.toHaveAttribute('aria-invalid', /.*/);
  await expect(field).not.toHaveAttribute('aria-describedby', /.*/);
});
```

```ts
// admin-commissions.a11y.spec.ts — AC-7: audit the state that now has the extra semantics.
it('has no axe violations while a rate editor shows a validation error', async () => {
  const fixture = await renderTab();
  const host = fixture.nativeElement as HTMLElement;

  host.querySelector<HTMLElement>('[data-testid="admin-commission-edit-7"]')!.click();
  fixture.detectChanges();
  await settle(fixture);
  const field = host.querySelector<HTMLInputElement>('[data-testid="admin-commission-percent-7"]')!;
  field.value = '101';
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  host.querySelector<HTMLElement>('[data-testid="admin-commission-save-7"]')!.click();
  fixture.detectChanges();
  await settle(fixture);

  await expectNoAxeViolations(host);
});
```

- [ ] **Step 2: Run them, verify they fail** —
      `npm test -- --run src/app/admin/admin-commissions.a11y.spec.ts` and
      `npm run test:e2e:a11y -- admin-commissions` → FAIL on the missing attributes / element.
      (If Phase 0 is already committed these pass immediately; then run them **against Phase 0's
      parent** to prove they are real assertions, or accept them as characterization tests and say
      so in the commit.)

- [ ] **Step 3: Fix the doc the change contradicts** — `admin-commissions.a11y.spec.ts`'s TSDoc:

```
 * <p>Audited in three states — closed, editor open, and editor showing a validation error. The
 * error element is mounted only while the error exists, so its association with the rate field
 * lasts exactly as long as the error does (#826); the earlier always-mounted alert region is gone.
```

(replacing *"…and an alert region that exists before it ever carries text."*)

- [ ] **Step 4: Run the frontend gate** — `npm run lint`, `npm run format:check`,
      `npm test -- --run src/app/admin/`, `npm run test:e2e:a11y -- admin-commissions`,
      plus `node scripts/check-touch-target.mjs --files frontend/src/app/admin/admin-commissions.ts`
      and `node scripts/check-focus-posture.mjs --files frontend/src/app/admin/admin-commissions.ts`
      → all green.

- [ ] **Step 5: Reconcile the file-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` (stage this plan doc first,
      or the guard short-circuits and passes whatever the section says).

- [ ] **Step 6: Commit** — `git commit -m "Prove the commission field-error association in a real browser (#826)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Execution status

**Stage pointer:** `implement — Phase 0 done, Phase 1 next`.

**Next action:** Open the draft PR (CI fires on `pull_request` only), then Phase 1 step 1.
Skill-routing gate re-run at implement entry: loaded `riviera-sdlc`, `riviera-local-debug`,
`riviera-frontend`, `angular-developer` + angular-cli MCP (`list_projects` → v22/Vitest,
`get_best_practices`), `riviera-tailwind`, `playwright-cli`, `tdd`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Split the error, associate the field half | ✅ | this commit |
| 1 — Prove it in a real browser, fix the stale doc | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | #826 Phase 0 | **Mechanism:** an element rendering an error message whose lifetime is NOT the error's lifetime — i.e. mounted unconditionally, so a `role="alert"` sits in the DOM empty. Enumerated by taking **every** `role="alert"` in `frontend/src` production files (85 hits repo-wide; spec files and comment-only lines dropped) and keeping the ones whose opening tag is not immediately preceded by a gating `@if` / `@else if` / `@case`. Deliberately **not** enumerated by `min-h-*`: the reserve is a symptom, and `oppw-error` below proves it — it reserves nothing (`empty:mt-0`), so a resemblance sweep would have missed it | `grep -rn 'role=\"alert\"' frontend/src --include=*.ts --include=*.html`, then a script walking back from each hit to its opening tag and testing the 3 non-blank lines above it for `@if` / `@else if` / `@case` | 4 ungated: `admin/admin-privacy.ts:179` (`admin-privacy-error`), `auth/operator-password.ts:98` (`oppw-error`), `auth/verify-email.ts:55` and `:69` | **`admin-commissions.ts` fixed** (this phase). **`verify-email.ts:55,69` — excluded:** static copy inside `@switch` `@case`/`@default` branches, so the branch *is* the gate; never mounted empty, and they name no control. **`admin-privacy-error` — excluded from association on its merits:** written only in the erasure submit's `catch` (*"Nothing was erased"*), an action outcome, not a verdict on the typed email — whose field error (`admin-privacy-email-error:101`) is already `@if`-gated and already carries `[appFieldErrorFor]`. **`oppw-error` — same:** written from `operatorPasswordChangeMessage(result)`, a failed submit (incl. `session-lost`), form-level and deliberately focus-managed (`tabindex=\"-1\"` + `revealOutcome()`). So **0 further sites take `[appFieldErrorFor]`** — #826 was the last field-scoped one. Both do carry the residual *empty live region* shape this phase removed from `admin-commissions`; that half is a separate, smaller fix outside #826's field-scoped population — **proposed as a follow-up issue at close-out**, recorded here rather than silently widening the slice |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `npm test -- --run src/app/admin/admin-commissions.spec.ts` → `describes the rate field by its validation error, and releases it once the value is usable` PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** same command → `refuses a change that is already the venue's rate` PASS. Verified at `<sha>`.
- [ ] **AC-4:** same command → `keeps the old rate and the typed draft when the write fails` PASS. Verified at `<sha>`.
- [ ] **AC-5:** same command → `mounts no error element while the editor is clean` PASS. Verified at `<sha>`.
- [ ] **AC-6:** `npm run test:e2e:a11y -- admin-commissions` → `an out-of-range rate names the field it blames, and lets go when corrected` PASS. Verified at `<sha>`.
- [ ] **AC-7:** `npm test -- --run src/app/admin/admin-commissions.a11y.spec.ts` → `has no axe violations while a rate editor shows a validation error` PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (`N/A` justified); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled (`N/A — frontend-only`); invariant #11 untouched.
- [ ] **Payment/payout** section filled (`N/A`); invariants #5, #8, #9 untouched — no arithmetic,
      no effective-dating, no wire change.
- [ ] Refund policy (invariant #10) — untouched.
- [ ] Timezone (invariant #6) — untouched.
- [ ] Booking codes (invariant #7) — untouched.
- [ ] Flyway (invariant #12) — no schema change, no version number claimed.
- [ ] **Frontend standards met:** `role="alert"` + `[appFieldErrorFor]` on the field error;
      `aria-invalid` claims the value is wrong and the write banner claims nothing (RV-FE-11);
      no `as any`; no new `.scss`; touch-target and focus-posture guards green.
- [ ] Behavior-parity ledger re-checked against the actual diff — every `preserved` row verified,
      not assumed.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] Follow-up issue filed (or explicitly declined) for the `#b3261e` → `riv-error-ink` sweep.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` per the invocation ladder *plus*
      `riviera-review-overlay`, not the overlay alone.
