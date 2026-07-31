# Booking-view tech debt (#477) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Clear items 1–4 of #477 — both `booking-view` focus effects use `afterRenderEffect`
and both are test-pinned, `booking-view` carries no stylesheet (Tailwind only), and
`ExpireRequests`'s javadoc stops repeating the twice-corrected "no PaymentIntent" overclaim.

**Architecture:** The one significant decision is the **breadth of the SCSS→Tailwind
migration** (`riviera-tailwind` step 2). `booking-view.scss`'s only shared recipe is the
`status-chip` SCSS mixin — the **last** mixin left in `shared/_glass.scss`, shared with
`my-bookings`. We take the **full port**: `status-chip` becomes `shared/status-chip.ts`, a
variant directive on the exact `shared/amenity-chip.ts` precedent, both consumers move to it,
and `shared/_glass.scss` is deleted. Narrow scope was rejected because it leaves `booking-view`
still carrying a stylesheet — i.e. item 3's stated unit of work ("migrating the component")
would not actually be met — and leaves the last mixin alive for a third consumer to grow onto.

**Persistence:** JDBC only (invariant #1). No tables, no migrations, no SQL in scope.

**Source of intent:** GitHub issue #477 (deferred from #123 / PR #476; findings register in
`docs/plans/withdraw-pending-request.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed all four
actionable items still reproduce verbatim on `main@851a708`, and that the only open PRs are ten
Dependabot bumps with no overlap; no Flyway number to claim) · `riviera-plan-doc` (this template —
forced the behavior-parity ledger, which is what turned "restyle only" into the 20-row
rule-by-rule ledger below) · `tdd` (phase order is the test-first argument: item 2's missing test
is written and proven red-on-removal **before** item 1 converts the effect it guards) ·
`riviera-review-overlay` (review gate — due at ready-for-review; RV-FE-7 is the item-3 finding
being paid off here) · `riviera-docs-freshness` (**due at close-out** over this PR's range — the
counting sweep matters: deleting `_glass.scss` makes "the shared SCSS recipes" a zero-member set,
and `shared/_glass.scss` is cited by name in three contrast specs and `amenities.contrast.spec.ts`'s
"only `status-chip` still lives there") · `riviera-tailwind` (the narrow-vs-full scope fork, the
no-`@apply` rule, the "keep the old semantic class as an inert test-hook marker" rule, the
radius-resolves-by-stylesheet-order warning, and the border-width-snapping gotcha) ·
`riviera-frontend` (placement: the ported chip is a *presentational primitive with no state and no
HTTP* → `shared/`, not `booking/`) · `angular-developer` + **angular-cli MCP**
(`get_best_practices` + `search_documentation` on `afterRenderEffect` — the docs' explicit-phase
guidance is what makes this a `write`-phase effect rather than the default `mixedReadWrite`;
`list_projects` confirmed Angular 22 + no SSR target) · `riviera-java-conventions` (§6c — the
item-4 fix is a javadoc edit, the one place long prose is *sanctioned*, so it stays on the doc
comment instead of migrating into the body) · `playwright-cli` (the computed-style drift check
that the contrast specs structurally cannot perform) · `riviera-local-debug` (scoped test runs;
loaded before the session's first `npm`).

**Branch:** `claude/sdlc-477-h25h0j` — **cloud-session substitution** for the usual
`feature/<slug>`, per `riviera-sdlc`'s remote-session addendum. Exists; cut from `main@851a708`.

---

## Acceptance criteria (testable)

> Written at the component boundary — what a guest/assistive-tech user observes — not at the
> Angular API. "Uses `afterRenderEffect`" is an implementation detail; "focus lands on the
> destructive button" is the behavior, and it must hold *across* the conversion.

- [ ] **AC-1:** Given a cancellable booking, when the guest opens the cancel confirm prompt, then
  focus moves to the destructive "Confirm cancellation" button. *Pinned by:*
  `booking-view.spec.ts` › `moves focus to the destructive confirm button when the cancel prompt appears`
- [ ] **AC-2:** Given the same two prompts (cancel and withdraw), when both focus effects are
  re-expressed as `afterRenderEffect` write-phase effects, then **both** focus behaviors still
  hold. *Pinned by:* the AC-1 spec **plus** the pre-existing
  `moves focus to the destructive confirm button when the withdraw prompt appears` — both green
  after the conversion, neither modified by it.
- [ ] **AC-3:** Given any booking status, when its chip renders through the new shared directive,
  then the element still carries the `.chip` and `.chip--<status>` marker classes and the same
  fill/ink/geometry as the retired mixin. *Pinned by:* `status-chip.spec.ts` (new — asserts marker
  classes + one fill per status against `STATUS_META`) and the untouched
  `booking-view.spec.ts` / `my-bookings.spec.ts` status assertions.
- [ ] **AC-4:** Given the booking-view page in both themes, when `booking-view.scss` is deleted and
  its rules are re-expressed as Tailwind utilities, then every asserted colour pair still meets
  WCAG AA and the rendered computed styles are unchanged. *Pinned by:* the unmodified
  `booking-view.contrast.spec.ts` + `booking-status.contrast.spec.ts` (values are byte-identical
  by construction) and the before/after computed-style diff recorded in the Verification log.
- [ ] **AC-5:** Given the CI-safe mocked e2e suite, when the whole booking-view flow is exercised
  after the migration, then it passes with no new axe violations. *Pinned by:*
  `npm run test:e2e:a11y` (existing `request-to-book.e2e.ts` + `my-bookings.e2e.ts` cover the
  withdraw, cancel and chip surfaces; no new spec required — see Non-goals).

**Not an AC — item 4** is a javadoc edit with no observable behavior; the issue itself says
"comment only; no test". It is verified by inspection in the Verification log, not by a test.
Writing a test that asserts a comment's wording would be ceremony, not coverage.

## Non-goals

- **Item 5 (orphan-PaymentIntent reconciliation) — no code, no design here.** #477 says it
  "needs its own design before any code (which surface sweeps, and how it distinguishes an orphan
  from an in-flight intent)". That is *fog*, not drift, in the issue-intake gate's sense, so it
  gets its own issue at close-out (user decision, this session) rather than a plan-doc open
  question. #477 closes on merge; the new issue carries item 5 forward with R-6's full context.
- **Withdraw for `AWAITING_PAYMENT`** — a product non-goal inherited from #123, restated here so
  it isn't re-derived.
- **The other six `booking/*.scss` files** (`booking-confirmation`, `booking-dialog`,
  `booking-pay`, `find-booking`, `my-bookings`, `request-confirmation`). `my-bookings.scss` is
  *touched* — it loses its `@include glass.status-chip` — but is **not** migrated. Migrating it
  is a separate slice.
- **No new e2e spec.** The migration changes no behavior, and the flows already have CI-safe
  coverage; a new spec would assert the same interactions with different words. The *new*
  verification this slice needs is a computed-style diff, which is a one-off measurement, not a
  regression spec (see the Verification log).
- **No re-tuning of any colour, alpha, radius, or shadow.** Every value is carried across
  unchanged. A contrast spec that needs editing to stay green means the migration drifted.

## Behavior-parity ledger

> Phases 3–4 are the textbook case this section exists for: a "styling-only" claim over 332 lines
> of SCSS. Enumerated rule-group by rule-group against `booking-view.scss` @ `851a708`.

| Old-surface behavior (booking-view.scss rule) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `:host { display:block; color: var(--riv-card-ink) }` | preserved | component `host: { class: 'block text-(--riv-card-ink)' }` |
| `.sr-only` visually-hidden clip recipe | preserved | Tailwind `sr-only` utility — same computed result, one word |
| `%card-surface` (`backdrop-filter: blur(26px) saturate(170%)`, radius 28px, two-layer shadow) | preserved | utilities on both consumers (`backdrop-blur-[26px] backdrop-saturate-[170%] rounded-[28px] shadow-[...]`); radius stays on the **consumer**, never the `appCardGlass` directive (`riviera-tailwind` rule 3) |
| `.booking-card` / `.state-card` box model (max-width, margins, padding, centring) | preserved | per-element utilities; the two differ (560/460px, 26px/40px padding) so no shared primitive is warranted |
| `h1` type ramp + `.state-card h1` override | preserved | utilities on each `<h1>`; the override becomes an explicit second class list rather than a cascade |
| `.lead` | preserved | utilities |
| `@include glass.status-chip` (`.chip` + 9 `.chip--*`) | **changed — moved, not dropped** | ported to `shared/status-chip.ts` (phase 3); same fills/inks/geometry, marker classes retained. Both consumers updated in the same commit |
| `.banner` + 5 `.banner--*` solid fills/borders | preserved | utilities; the five fills stay literal hex (theme-independent by design — the css:S7924 treatment) |
| `.banner-eyebrow` + 5 per-banner ink overrides | preserved | the ink moves onto the eyebrow element per banner, replacing the descendant-selector override — same computed colour, no cascade |
| `.banner-body`, `.banner-body strong` | preserved | utilities; `strong` styled via `[&_strong]:text-[#0a2a33]` |
| `.btn-cta` (gradient CTA, full-width, shadow) | preserved | utilities incl. `bg-(image:--riv-cta-grad)` (gradient token = *image*, not colour) |
| `.code-card`, `.code-label`, `.code`, `.code-note` | preserved | utilities; the dashed border keeps `border-dashed border-(--riv-field-border)` |
| `.details` / `.row` / `.row:last-child` / `dt` / `dd` / `dd.amount` | preserved | utilities on the row template; `:last-child` → `last:border-b-0` |
| `.result` + `.result:empty { display:none }` | preserved | `empty:hidden` — the exact Tailwind twin, and load-bearing: both live regions render an empty `<p>` until they have something to announce |
| `.banner .confirm-q, .banner .result` ink override | preserved | the in-banner instances take the banner ink directly on the element; the descendant selector disappears with no computed-style change |
| `.withdraw`, `.cancel` (+ its `h2`), `.terms`, `.confirm-q`, `.actions` | preserved | utilities |
| `.btn-danger` / `.btn-outline` / `.btn-outline.danger` | preserved | utilities; `.btn-outline.danger`'s two overrides become an explicit variant class list on the one element that uses it |
| `:disabled { opacity: .65; cursor: not-allowed }` on all three buttons | preserved | `disabled:opacity-65 disabled:cursor-not-allowed` per button |
| `.link`, `.link.back` | preserved | utilities |
| `:focus-visible` rings (2.4.7) — accent for danger/outline/link, white for CTA | preserved | `focus-visible:outline-3 focus-visible:outline-(--riv-accent-ink) focus-visible:outline-offset-2` (white variant on the CTA). **Non-negotiable**: this is a WCAG 2.4.7 conformance rule, not decoration |
| `@media (hover:hover)` hover states (3 buttons) | preserved | `hover:` already compiles under `@media (hover:hover)` in Tailwind v4 |
| `@media (prefers-reduced-motion: reduce) { transition: none }` | preserved | `motion-reduce:transition-none` on each of the three buttons — the guard must stay **with** the motion it guards (the #134 lesson) |
| per-property transitions (`filter .15s ease`, `background .15s ease`) | preserved | `[transition:filter_0.15s_ease]` / `[transition:background_0.15s_ease]` — arbitrary value, because bare `transition` changes both the property set and the easing |

**Dropped: none.** Every rule above has a destination. That is the claim phase 4 must actually
prove, which is what the computed-style diff is for.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `afterRenderEffect` does not flush under the zoneless Vitest/jsdom harness the way `effect()` does, so the focus tests break — or worse, pass in tests but no longer focus in a browser | med | high | Phase order is the mitigation: AC-1's test is written and **proven red-on-removal** in phase 2, *before* phase 3 converts anything, so the conversion has a live guard on both prompts. `await fixture.whenStable()` (already the idiom in both existing tests) is what flushes render hooks in a zoneless fixture. Browser-side proof comes from the existing `request-to-book.e2e.ts` run | claude | open |
| R-2 | `afterRenderEffect` runs on browser platforms only — an SSR/prerender build would silently lose focus management | low | med | Verified there is no SSR: no `@angular/ssr`/`platform-server` dependency and no `server`/`prerender` target in `angular.json`. Nothing to mitigate; recorded so a future SSR slice knows this is a dependency | claude | closed — verified at plan time |
| R-3 | The default `afterRenderEffect(cb)` form runs in `mixedReadWrite`, which the Angular docs explicitly warn against ("you risk significant performance degradation") | med | low | Use the explicit-phase spec form `afterRenderEffect({ write: … })`. `focus()` is a DOM **write** and the effect's other reads are *signal* reads, not DOM reads, so `write` is the correct phase. (Note: `venue-map.ts`'s existing call legitimately uses the callback form — it genuinely reads layout *and* writes a signal) | claude | open |
| R-4 | A directive host `[class]` binding **replaces** a static `class` on the same element, silently dropping `.chip`/`.chip--*` — which four spec files and the e2e query | med | high | The `amenity-chip.ts` precedent documents exactly this trap: the directive owns the **whole** class list including the marker classes, and the consuming template carries no `class` attribute on that element. `status-chip.spec.ts` asserts the markers survive | claude | open |
| R-5 | Colour/geometry drift the contrast specs cannot see — they are pure maths over hard-coded values and would stay green against a component that no longer renders those values at all | med | high | Before/after **computed-style diff** in a real browser (`riviera-tailwind`'s hard rule), recorded in the Verification log. Known false positive to *not* chase: Chromium snaps `border-width: 1.5px` → `"1px"`, identical to the SCSS | claude | open |
| R-6 | Deleting `shared/_glass.scss` and `booking-view.scss` leaves dangling citations — the #472/#473 failure class, where specs cited stylesheets that had moved | high | low | Grep every citation of both filenames and re-point in the same commit that deletes them; `riviera-docs-freshness` at close-out over the PR range as the backstop. Known sites: `booking-view.contrast.spec.ts`, `booking-status.contrast.spec.ts`, `amenities.contrast.spec.ts` ("only `status-chip` still lives there" goes false), `my-bookings.scss`'s section comment | claude | open |
| R-7 | `my-bookings` regresses as collateral — it is a *consumer* of the ported mixin but is not otherwise migrated | med | med | Its `@include` is replaced by the directive in the same commit, its chip assertions run unmodified, and its rendering is covered by the computed-style diff and `my-bookings.e2e.ts` | claude | open |
| R-8 | The banner ink overrides (`.banner .confirm-q`, `.banner .result`) are **descendant selectors** — flattening them onto elements could miss an instance, letting a themed ink land on a fixed banner fill (drifts between themes) | low | med | Only one element of each kind renders inside a banner (the withdraw confirm question and the withdraw result line); both are inside the `PENDING_REQUEST` case. The withdraw-prose assertion in `booking-view.contrast.spec.ts` pins the intent and stays unmodified | claude | open |

## Open questions / Assumptions

- **Assumption:** `.result:empty { display:none }`'s Tailwind twin `empty:hidden` matches on the
  same condition (no child nodes *and* no text). Angular's `@if`-empty `<p>` renders comment
  anchors — which are nodes. — *Owner:* claude · *Resolves by:* phase 4 (the computed-style diff
  measures `display` on both live regions in their empty state; if `:empty` and `empty:` disagree,
  the rule survives as a one-line `styles:` block rather than being dropped).

### Resolved

- **Open question (scope):** narrow vs full SCSS→Tailwind migration — `riviera-tailwind` step 2
  requires asking when the shared recipe has real blast radius. **Resolved: full port**, delegated
  to me by the user ("consult angular mcp search document and choose what is best") and decided on
  three grounds: (1) Angular has no CSS-level sharing primitive — the framework's own sanctioned
  reuse layer for cross-component styling is a directive with `host` bindings, which the
  angular-cli MCP best-practices guide states directly ("Put host bindings inside the `host`
  object of the `@Component` or `@Directive` decorator"), making the SCSS mixin the
  non-idiomatic holdover; (2) repo precedent — `card-glass`, `panel-glass`, `amenity-chip`,
  `failure-panel` and `retry-button` were **all** already ported from this same file, leaving
  `status-chip` as the last one; (3) the blast radius is two consumers, not "widely shared", so
  the diff stays contained. Narrow scope was rejected for leaving `booking-view` half-migrated.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No write path to `availability(set_id, booking_date)` is
touched, added, or removed. The slice is presentational plus one javadoc: no service, controller,
port, SQL, transaction, or scheduled sweep changes. `ExpireRequests` — whose javadoc phase 5
edits — *is* a release path for that row, which is precisely why the edit is confined to the
comment: the sweep's guarded transition and its row-lock argument are untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Phase 5 edits the javadoc of `booking.application.request.ExpireRequests`, the request-expiry use-case port. Text only — no signature, no package move, no dependency |

**Cross-module named interfaces (`api/` ports):** none added or changed. `ExpireRequests` is an
`application`-internal port, not a published surface; its wording change is invisible across the
module boundary.

**Domain events:** none added, changed, or subscribed.

### Module ownership (§4a)

All backend work is one javadoc line inside `booking`; no capability moves. No boundary change.
The frontend work is outside the Modulith entirely — placement there is `riviera-frontend`'s call
(`shared/`, justified in the Angular section below).

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope; no money moves.** Worth one sentence because phase 5 *reads* as
payment work: it corrects a claim **about** PaymentIntents without touching any payment code path.
The substance is that a `PENDING_REQUEST` has no PaymentIntent **on record** — the `payment` table
row is what webhooks correlate against (invariant #8) — while an *unregistered* residual intent at
Stripe may exist after a failed accept. The comment gains "on record"; nothing else changes.
The residual-intent cleanup itself is item 5, split to its own issue (Non-goals).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | existing | standalone component | signals; two focus effects become `afterRenderEffect({ write })`; `styleUrl` removed, host classes added | none |
| FE-2 | `booking/booking-view.spec.ts` | existing | Vitest/jsdom spec | — | — |
| FE-3 | `shared/status-chip.ts` | **new** | attribute directive | `input()` + `computed()` host `[class]` | none |
| FE-4 | `shared/status-chip.spec.ts` | **new** | Vitest/jsdom spec | — | — |
| FE-5 | `booking/my-bookings.ts` + `.scss` | existing | standalone component | chip span moves to the directive; `@include` removed | none |
| FE-6 | `booking/booking-view.scss`, `shared/_glass.scss` | **deleted** | — | — | — |
| FE-7 | three `*.contrast.spec.ts` citations | existing | specs | re-pointed only; **no assertion changes** | — |

**Placement (`riviera-frontend`):** `status-chip.ts` is a *pure, stateless presentational
primitive* — no HTTP, no app state, imports nothing app-internal — so it belongs in `shared/`,
beside `amenity-chip.ts` and next to the `booking-status.ts` vocabulary it renders. Not `core/`
(nothing stateful), not `booking/` (two feature consumers, and a feature must never import
another feature).

**Standards:** standalone, `input()`, `computed()`, host bindings in the `host` object (never
`@HostBinding`), no `ngClass`, native control flow. Deviation from the "prefer inline templates"
default: `booking-view`'s template is large and already inline — it stays inline; only the
stylesheet is retired.

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, or wire shape is added, removed, or altered.

## Execution status

**Stage pointer:** `plan → implement` (phase 1 next)

**Next action:** commit this plan doc on `claude/sdlc-477-h25h0j`, push, and open the **draft PR**
immediately — CI fires on `pull_request` only, so an un-PR'd branch gets no CI at all (#417).

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — Plan doc + draft PR | ⏳ | |
| 2 — Item 2: cancel-prompt focus test (red-on-removal proven) | | |
| 3 — Item 1: both effects → `afterRenderEffect({ write })` | | |
| 4 — Item 3a: `status-chip` mixin → `shared/status-chip.ts`; delete `_glass.scss` | | |
| 5 — Item 3b: `booking-view.scss` → Tailwind; delete the stylesheet | | |
| 6 — Item 4: `ExpireRequests` javadoc | | |
| 7 — Close-out: item-5 issue, docs freshness, gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/booking-view-tech-debt.md` — this plan (phase 1)
- `frontend/src/app/booking/booking-view.spec.ts` — + cancel-prompt focus test (phase 2)
- `frontend/src/app/booking/booking-view.ts` — effects → `afterRenderEffect` (phase 3); chip
  directive + Tailwind host/template classes, `styleUrl` removed (phases 4–5)
- `frontend/src/app/shared/status-chip.ts` — **new** variant directive (phase 4)
- `frontend/src/app/shared/status-chip.spec.ts` — **new** spec (phase 4)
- `frontend/src/app/booking/my-bookings.ts` — chip span → directive (phase 4)
- `frontend/src/app/booking/my-bookings.scss` — `@include` + `@use` removed (phase 4)
- `frontend/src/app/shared/_glass.scss` — **deleted** (phase 4)
- `frontend/src/app/booking/booking-view.scss` — **deleted** (phase 5)
- `frontend/src/app/**/*.contrast.spec.ts` — citations re-pointed (phases 4–5)
- `platform/src/main/java/ai/riviera/platform/booking/application/request/ExpireRequests.java`
  — javadoc (phase 6)

---

## Phase 1 — Plan doc + draft PR

- [ ] **Step 1: Commit this plan** — `git commit -m "docs(#477): plan the booking-view tech-debt slice"`
- [ ] **Step 2: Push** — `git push -u origin claude/sdlc-477-h25h0j`
- [ ] **Step 3: Open the draft PR** immediately (the CI vehicle, not a review request).

## Phase 2 — Item 2: the cancel prompt's missing focus test

**Files:** Modify `frontend/src/app/booking/booking-view.spec.ts`

- [ ] **Step 1: Write the test** — the exact twin of the withdraw one (line ~227), against
  `DETAIL` (cancellable) rather than `PENDING`:

```ts
it('moves focus to the destructive confirm button when the cancel prompt appears', async () => {
  // Twin of the withdraw test below: the component claims focus management as an a11y
  // behaviour for BOTH destructive prompts; only one of them was pinned (#477 item 2).
  const fixture = await render(stubService({ detail: DETAIL }));
  const host = fixture.nativeElement as HTMLElement;

  (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  expect(document.activeElement).toBe(host.querySelector('[data-testid="confirm-cancel"]'));
});
```

- [ ] **Step 2: Prove it is not vacuous** — this is a **characterization** test: it passes on
  today's code, so "watch it fail first" does not apply. Instead, temporarily comment out the
  cancel focus effect in `booking-view.ts`, run the spec, and confirm it goes **red**; restore the
  effect and confirm green. A coverage test that cannot fail is not coverage.
  `npx vitest run src/app/booking/booking-view.spec.ts`
- [ ] **Step 3: Commit** — `git commit -m "test(#477): pin the cancel prompt's focus move (item 2)"`
- [ ] **Step 4: Update the execution status** in the same commit window.

## Phase 3 — Item 1: both focus effects → `afterRenderEffect`

**Files:** Modify `frontend/src/app/booking/booking-view.ts:312-322`

- [ ] **Step 1: Convert both effects together** (converting one would leave two identical effects
  in one component using two different APIs — the reason #123 deferred this):

```ts
    // Focus the destructive confirm button when its prompt appears (a11y). A DOM write, so it
    // runs in afterRenderEffect's `write` phase — the explicit phase the Angular docs require.
    afterRenderEffect({
      write: () => {
        if (this.confirming()) {
          this.confirmButton()?.nativeElement.focus();
        }
      },
    });
    afterRenderEffect({
      write: () => {
        if (this.confirmingWithdraw()) {
          this.withdrawConfirmButton()?.nativeElement.focus();
        }
      },
    });
```

  ...with `effect` dropped from the `@angular/core` import and `afterRenderEffect` added.

- [ ] **Step 2: Run both focus tests** — `npx vitest run src/app/booking/booking-view.spec.ts`
  → PASS. If either goes red, R-1 has materialized: diagnose the harness's render-hook flush
  before touching the assertions. **Never retune a test to match a regression.**
- [ ] **Step 3: Commit** — `git commit -m "refactor(#477): move both focus effects to afterRenderEffect (item 1)"`
- [ ] **Step 4: Update the execution status.**

## Phase 4 — Item 3a: port `status-chip` to a shared directive

**Files:** Create `shared/status-chip.ts`, `shared/status-chip.spec.ts` · Modify `booking-view.ts`,
`my-bookings.ts`, `my-bookings.scss`, the citing contrast specs · Delete `shared/_glass.scss`

- [ ] **Step 1: Write the failing spec** (`status-chip.spec.ts`) — asserts, for a representative
  status, that the host carries `chip`, `chip--confirmed`, and the fill/ink utilities; and that an
  unknown status still renders the neutral fallback chip (`metaFor`'s FE/BE-skew tolerance).
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/status-chip.spec.ts`
  → FAIL (module not found).
- [ ] **Step 3: Implement the directive**, on the `amenity-chip.ts` shape: `selector:
  '[appStatusChip]'`, host `{ '[class]': 'classes()' }`, one `input()` taking the **modifier**
  (`chip--confirmed`) so both consumers keep their existing `STATUS_META`-derived `chipClass`
  logic untouched, and a `computed()` returning `'chip ' + modifier + base + FILL[modifier]`.
  The fills are the mixin's nine literal triples, carried across unchanged.
- [ ] **Step 4: Update both consumers** — the `<span>`s in `booking-view.ts` and `my-bookings.ts`
  drop their `class="chip {{ … }}"` (the directive owns the whole list — R-4) and take
  `[appStatusChip]`. Remove `@include glass.status-chip` + the now-unused `@use` from
  `my-bookings.scss` and `booking-view.scss`, then **delete `shared/_glass.scss`**.
- [ ] **Step 5: Re-point every citation of `shared/_glass.scss`** (R-6) — including
  `amenities.contrast.spec.ts`'s "only `status-chip` still lives there", which becomes false.
- [ ] **Step 6: Run the touched specs** —
  `npx vitest run src/app/shared/status-chip.spec.ts src/app/shared/booking-status.contrast.spec.ts src/app/booking/booking-view.spec.ts src/app/booking/my-bookings.spec.ts`
  → PASS, with **no assertion edits** in the pre-existing specs.
- [ ] **Step 7: Commit** — `git commit -m "refactor(#477): port the status-chip mixin to a shared directive (item 3)"`
- [ ] **Step 8: Update the execution status.**

## Phase 5 — Item 3b: `booking-view.scss` → Tailwind

**Files:** Modify `booking-view.ts` · Delete `booking-view.scss` · Modify `booking-view.contrast.spec.ts` (citation only)

- [ ] **Step 1: Capture the "before" computed styles** — with the working tree still on the SCSS
  version, drive the booking-view page in Chromium via the mocked e2e harness and dump
  `getComputedStyle` for one element per ledger row, in **both** themes, to the scratchpad.
- [ ] **Step 2: Port the rules** ledger row by ledger row into template/host utilities; delete
  `booking-view.scss` and its `styleUrl`. Retain every semantic class a spec or e2e queries as an
  inert marker (`riviera-tailwind` rule 2).
- [ ] **Step 3: Capture "after" and diff** — same elements, same themes. Investigate every
  difference; the only sanctioned one is Chromium's `1.5px → "1px"` border snapping (R-5).
- [ ] **Step 4: Run the frontend gate** — `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e:a11y`.
- [ ] **Step 5: Commit** — `git commit -m "refactor(#477): migrate booking-view from SCSS to Tailwind (item 3)"`
- [ ] **Step 6: Update the execution status** + record the diff result in the Verification log.

## Phase 6 — Item 4: the `ExpireRequests` javadoc overclaim

**Files:** Modify `platform/.../booking/application/request/ExpireRequests.java:8-9`

- [ ] **Step 1: Correct the claim** — "a pending request has no PaymentIntent" becomes "no
  PaymentIntent **on record**", the phrasing already used by `CancelPaymentPort`,
  `StripePaymentGateway` and `WithdrawRequest`, with one clause naming why the distinction is
  load-bearing (a failed accept can leave an *unregistered* residual intent at Stripe).
  Javadoc, so §6c's one-line rule does not bind — this is the sanctioned home for the prose.
- [ ] **Step 2: Verify nothing else compiles differently** — comment-only; confirm with
  `git diff --stat` that the change is a single file, javadoc lines only.
- [ ] **Step 3: Generalization-audit pass** — grep the whole backend for the same overclaim
  ("no PaymentIntent" without "on record"). #123 corrected three sites and this is the fourth;
  a fifth would be the same staleness class. Record the search in the log below.
- [ ] **Step 4: Commit** — `git commit -m "docs(#477): stop overclaiming that a pending request has no PaymentIntent (item 4)"`
- [ ] **Step 5: Update the execution status.**

## Phase 7 — Close-out

- [ ] **Step 1: File the item-5 issue** — orphan-PaymentIntent reconciliation, design-first,
  carrying R-6's context from `docs/plans/withdraw-pending-request.md` and #98's original note.
- [ ] **Step 2: Merge latest `origin/main`** into the branch; mark the PR ready for review.
- [ ] **Step 3: Review gate** — `/code-review` per the `pr-gates.md` §1 invocation ladder, plus
  `riviera-review-overlay`. Findings re-enter at Implement.
- [ ] **Step 4: Sonar gate** — pull the new-issue + duplication list from the API; fix every entry.
- [ ] **Step 5: `riviera-docs-freshness`** over the PR range — with attention to the counting
  sweep: `shared/_glass.scss` ceases to exist, so every doc saying "the shared SCSS recipes",
  "7 of the ~13 remaining `.scss` files", or "only `status-chip` still lives there" is stale.
  `riviera-tailwind`'s own migration-checklist paragraph names those counts and must be updated.
- [ ] **Step 6: Finalize this section in the PR's own last commit**, citing `merged via PR #NN` —
  never a merge SHA (it cannot exist yet; three consecutive slices paid that tax).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Verification log

> Evidence for the claims the specs structurally cannot make — the computed-style diff (R-5) and
> the inspection-only item 4. Filled during execution, not at plan time.

| What | Method | Result |
|---|---|---|
| Computed-style parity, booking-view, both themes | Chromium `getComputedStyle` before/after (phase 5) | *pending* |
| Item 4 javadoc | inspection + `git diff --stat` (phase 6) | *pending* |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npx vitest run src/app/booking/booking-view.spec.ts` → the cancel focus test
  passes, **and** was proven red with the effect removed (phase 2 step 2).
- [ ] **AC-2:** same command after phase 3 → both focus tests pass, neither assertion edited.
- [ ] **AC-3:** `npx vitest run src/app/shared/status-chip.spec.ts` + the two consumer specs → PASS.
- [ ] **AC-4:** `npm test` (contrast specs unmodified) + the computed-style diff → no differences
  beyond the documented border snapping.
- [ ] **AC-5:** `npm run test:e2e:a11y` → PASS, no new axe violations.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A — no write path touched); invariant #2 unaffected.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module imports added; no events changed (invariant #11).
- [ ] **Payment/payout** section filled (N/A, with the reason the javadoc *reads* payment-adjacent).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — untouched; no new logging.
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per `pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
