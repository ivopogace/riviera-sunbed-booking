# Riviera frontend overlay items

Repo-specific frontend bank items, layered onto the active review engine's generic
frontend bank and walked after it. Item format: gate → follow-up → default severity.
Invariant numbers reference `CLAUDE.md`.

## Always-run (when scope is FE or Full-stack)

### RV-FE-1. Angular standards
**Gate:** Does new Angular code follow the project standards?
- [ ] standalone components (no `NgModule` for new code)
- [ ] `inject()` not constructor DI
- [ ] `@if`/`@for`/`@switch` not `*ngIf`/`*ngFor`
- [ ] `input()`/`output()` signal APIs not `@Input`/`@Output`
- [ ] `NgOptimizedImage` for new `<img>` (venue photos especially)
- Greppable (Angular 22+):
  - [ ] no redundant `standalone: true` (default ≥ v20)
  - [ ] no explicit `changeDetection: OnPush` (default ≥ v22)
  - [ ] `class`/`style` bindings, not `ngClass`/`ngStyle`
  - [ ] host bindings in the `host: {}` object, not `@HostBinding`/`@HostListener`
  - [ ] singleton services use `providedIn: 'root'` (or the `@Service` decorator, v22+)

**Follow-up:** `grep -rn "standalone: true\|ChangeDetectionStrategy.OnPush\|ngClass\|ngStyle\|@HostBinding\|@HostListener" frontend/src`
should return nothing for new code. Document any deliberate deviation in the plan doc. The
full Angular standards are the `angular-developer` skill's `references/`.

**Default severity:** Minor (consistency), Major if a non-standard pattern spreads.

---

### RV-FE-7. Styling is Tailwind, shared via directives, with no rendered drift (`riviera-tailwind`)
**Gate:** Does new/changed styling follow the project's Tailwind conventions?
- [ ] Tailwind utilities by default — new component styling isn't a fresh `.scss` unless justified with its stated why
- [ ] **migrate-on-touch:** a component the diff touches that still carries legacy SCSS had that styling migrated in this slice — or the SCSS is a justified holdout, or the defer was maintainer-approved via `AskUserQuestion` and recorded with a follow-up issue (never self-granted)
- [ ] a reused surface/element is a shared directive/component (`shared/*-glass.ts`, `retry-button.ts`), **not** `@apply`/`@utility`
- [ ] a class a spec queries (`.set-tile.premium`, `.amenity-chip`, `.failure-title`, …) is retained as an inert marker after its styling moved to utilities
- [ ] a restyle/migration proves no rendered drift with a computed-style diff, not just the class list (the `*.contrast.spec.ts` are pure maths and can't see it)
- [ ] a new/changed interactive control meets the 44 × 44 px floor

**Follow-up:**
- The touch-target floor has a gating guard and a measuring sweep; neither is the other.
  `check-touch-target.mjs` (CI step + `PostToolUse` hook) fails the build when a
  `<button>`/`<input>`/`<select>`/`<textarea>` declares neither `[appTouchTarget]` nor a
  reasoned `data-touch-exempt` — those lines are the build's finding, not yours. It proves
  only that something was *declared*. Blind to: a declaration that is false (the directive
  is a no-op on a `display: inline` box, so `min-h-11` on a bare `<a>` changes nothing) and
  every `<a>` (out of scope by design). Rendered size is `frontend/e2e/touch-targets*.e2e.ts`'s to prove.
- Sharing moves to the directive/component layer — Tailwind has no mixin and this repo does
  not `@apply`. Surface directives carry no `border-radius` (it resolves by stylesheet
  order, not `class` order).
- Don't flag a `getComputedStyle` `border-width` of `"1px"` for a `1.5px` border as a
  regression — Chromium snaps it, identically to the old SCSS.

**Default severity:** Minor for an idiom slip; **Major** for a restyle shipped with no
drift check, or an `@apply`/new-`.scss` sharing pattern that spreads.

---

### RV-FE-6. Forms use the modern API (Signal Forms / Reactive, never Template-driven)
**Gate:** Do new forms use a modern forms API with typed, server-validated state?
- [ ] **Signal Forms** (`@angular/forms/signals`, stable v22+) preferred for new forms
- [ ] Reactive forms acceptable when Signal Forms don't fit
- [ ] **Template-driven** forms (`[(ngModel)]`-driven) for new work (violation)
- [ ] form types are explicit — no `any` on form values that cross the FE↔BE contract
- [ ] client validation is UX only; the server is authoritative (esp. money, dates, availability)

**Follow-up:** price (minor units, #5), booking date / cutoff (`Europe/Tirane`, #4/#6),
and set availability (#2) are decided server-side. A form that "validates" availability
locally and trusts it is a smell (RV-FE-2).

**Default severity:** Major for a new Template-driven form or `any`-typed form values on
the contract; Minor for a Reactive-where-Signal-Forms-fit style choice.

---

### RV-FE-2. Beach-map availability can go stale — handle the conflict (invariant #2)
**Gate:** Does the seat picker treat its availability snapshot as stale-able and recover
when a chosen set was taken meanwhile?
- [ ] map refetches availability for the selected date (not cached indefinitely)
- [ ] booking submit handles a `409 SET_TAKEN` by refreshing the map and telling the user
- [ ] optimistic "selected" state with no server reconciliation (violation)
- [ ] taken sets visually distinct and not selectable

**Follow-up:** on `409 SET_TAKEN`, refresh availability, grey out the set, and prompt
"that spot was just taken, pick another." Re-fetch when the user returns to the map or
changes the date.

**Default severity:** Major for no conflict handling on submit; Minor for a missing
periodic refresh.

---

### RV-FE-3. Money and dates rendered from the wire shape (invariants #5, #6)
**Gate:** Does the UI render money from minor units + currency, and dates as the booking
`LocalDate`, without doing money math in JS floats?
- [ ] amount formatted from integer minor units + currency code
- [ ] price arithmetic done in JS with floats (violation)
- [ ] booking date shown as a date (no implicit timezone shift)
- [ ] total recomputed client-side and trusted (smell — server is authoritative)

**Follow-up:** format minor units to a localized currency string at the view edge; the
displayed total is for confirmation, the server computes the charged amount. A booking date
is a calendar day — render it without a timezone offset that could roll it a day.

**Default severity:** Major for client-side float money math that drives the charge;
Minor for display-only rounding.

---

### RV-FE-4. Payment UI trusts Stripe Elements, not the client (invariant #8)
**Gate:** Does the checkout use Stripe's hosted/Elements flow with only the publishable
key, and never self-report success to confirm a booking?
- [ ] Stripe Elements / Checkout with publishable key only
- [ ] any secret/restricted key in the frontend bundle (violation)
- [ ] booking shown as confirmed purely from the client redirect, with no server/webhook confirmation (violation)
- [ ] card data touched by app code instead of Stripe (violation — PCI)

**Follow-up:** the post-payment redirect updates UX optimistically but the booking's
confirmed state comes from the server (driven by the verified webhook): show a
"finalizing" state and reconcile. Grep the bundle/config for secret keys.

**Default severity:** **Blocker** for a secret key in the bundle or raw card handling;
Major for treating the redirect as proof of payment.

---

### RV-FE-5. The visual seat picker is accessible
**Gate:** Is the beach-map seat picker usable beyond a pure pointer/visual interaction?
- [ ] sets are keyboard-focusable and activatable
- [ ] taken vs available conveyed by more than color alone
- [ ] each selectable set has an accessible name (row/position, price, status)
- [ ] map is a `<canvas>`/SVG with no semantic fallback (concern)

**Default severity:** lean Major for keyboard inaccessibility (the picker is the core flow).

---

### RV-FE-E2E. A user-facing frontend change carries the right Playwright e2e coverage
**Gate:** Does the diff add/adjust an e2e spec that (a) is authored to Playwright best
practice — load `playwright-cli` and judge the spec against it — and (b) lives in the suite
that will actually run it?
- [ ] coverage exists for the changed flow (not just a unit spec)
- [ ] role/label/test-id locators over CSS/text, web-first `expect` auto-waiting (no fixed sleeps), per-test isolation, no brittle selectors
- [ ] it is in the correct suite — mocked-a11y (`frontend/e2e/`, `npm run test:e2e:a11y`, **CI-run**) for render/a11y/interaction; real-backend (`frontend/e2e/real-backend/`, `npm run test:e2e`, **local-only**) for wiring / DB constraints / round-trip
- [ ] no strict-mode/timing flakiness (exact-vs-non-exact `getByLabel` under Signal Forms; `getByTestId` for option-folding selects)
- [ ] per-test unique data, no reliance on seeded rows
- [ ] asserts the read-back round-trip
- [ ] a backend-dependent spec is NOT parked where CI can't run it (leaving CI green-but-blind)

Project facts the generic skill can't know: the two suites are the CI-run mocked-a11y
suite (`frontend/e2e/`, API mocked via `page.route`, `playwright.a11y.config.ts` with
`testIgnore: '**/real-backend/**'`) and the local-only real-backend suite
(`frontend/e2e/real-backend/`, boots Spring Boot + Flyway Postgres, `playwright.config.ts`).
A spec lives in exactly one tree. In cloud sessions never `playwright install` — Chromium is
pre-installed and both configs take `PW_CHROMIUM_EXECUTABLE` (recipe: `riviera-local-debug`).

**Follow-up:** `playwright-cli` must appear in *Skills consulted* for a frontend slice
(RV-PROC-1). New specs pass `npm run lint` (covers `e2e/**/*.ts`) and stay out of vitest
(`*.e2e.ts`, not `*.spec.ts`).

**Default severity:** **Major** (Blocker if the change removes existing coverage or makes
the CI-run suite green-but-blind to a real regression; Minor for a cosmetic-only tweak).

---

### RV-FE-8. No **new** cross-feature import (the FE mirror of RV-BE-3 / invariant #11)
**Gate:** Does the diff add a feature-folder import that isn't already in
`riviera-frontend`'s frozen debt table?
- [ ] no new `feature/ → other-feature/` import
- [ ] no new `shared/ → feature/` or `core/ → feature/` import — these break the edges that keep the direction acyclic
- [ ] no new `pages/ → feature/` import
- [ ] a removed or consolidated existing edge is fine
- [ ] a genuinely needed new edge is argued in the plan doc, not slipped in on the table's precedent

The table is a freeze, not a licence: "`operator/` already imports `venue/`" is not an
argument for a new import. Verify mechanically — feature folders are the direct children of
`frontend/src/app`; `core/`, `shared/`, `pages/`, `environments/` are not. Match both
`../feature/` and `../../feature/`:

```
grep -rn "from '\(\.\./\)\+\(admin\|auth\|booking\|operator\|pages\|venue\)/" \
  --include=*.ts frontend/src/app | grep -v "\.spec\.ts"
```

**Follow-up:** a new edge that is really "two features need the same thing" → promote it
(pure → `shared/`, stateful/HTTP → `core/`). Shrinking the set means updating
`riviera-frontend`'s table in the same PR. No ESLint boundary rule enforces this today.

**Default severity:** **Major** for a new feature→feature import; **Blocker** for a new
`shared/ →` or `core/ → feature/` import. Not a finding for a pre-existing edge the diff
merely moves or consolidates.

---

### RV-FE-9. A transition that destroys the focused element moves focus (WCAG 2.4.3)
**Gate:** Does every transition the diff writes that unmounts or disables the element focus
is on move focus somewhere deliberate, via `shared/focus-after-render.ts`'s `focusMover()`?
- [ ] a **confirm-before-destroy** surface has all three legs: **open** (onto the confirm's destructive button), **back-out** (onto the trigger it replaced), **settled** (onto the notice carrying the outcome) — success *and* failure
- [ ] a **modal/panel dismiss** returns focus to the trigger that opened it — re-rendering a trigger does not focus it
- [ ] a teardown that is not a confirm surface — a venue switch, a route change, a row removal, an error panel replacing a form — also moves focus when what it tore down held it
- [ ] the move sits inside whatever staleness guard the write already has (`epoch`), so a superseded response moves nothing
- [ ] focus lands somewhere that says something, and the landing spot can take it (`tabindex="-1"` on a landmark; `focusMover()` adds one)
- [ ] a busy `<button>`/`<a>` uses `[appBusy]`, not `[disabled]`

**The guard** (`node scripts/check-focus-posture.mjs --diff origin/main`; `PostToolUse`
hook + CI step) carries rules in two opposite postures:
- **BUSY-1 fails the build** for a `[disabled]` bound to an in-flight flag on a
  `<button>`/`<a>` — CI names the line; don't re-flag it. But it matches a curated
  vocabulary: `loading`, `pending`, `processing`, `updating`, `creating` are excluded by
  name, so `[disabled]="loading()"` is green and yours. A flag renamed in the `.ts` while
  the template's `[disabled]` line stays untouched context is also unjudged (the guard
  judges added lines only; a re-indented line counts as added). Silence means "not a shape
  I match", never "checked and fine". **BUSY-2** gates a `(change)`/`(blur)` +
  busy-`[disabled]` pairing on the `readonly`-lockable input kinds.
- **FOCUS-1 prints and returns 0** — advisory. A green hygiene job can sit on top of unread
  FOCUS-1 findings: read the step's output, not its exit code. Don't promote it to gating.

**What the guard cannot judge — this item's territory:**
1. **Where focus should land.** The guard asks only whether a focus call site exists;
   landing on the page host is not landing on the notice that says what happened.
2. **A second stranding flip on an already-compliant signal.** FOCUS-1 excuses a signal by
   one compliant flip site, so a second stranding flip beside a good one is unreported — as
   is a teardown written as `update(…)`, a `linkedSignal`, anything not a `set(false)`.
3. **Teardowns that are neither a confirm branch nor a focus trap.** FOCUS-1 triggers on an
   `@if` whose condition matches `/confirm/i` or renders a focus trap (`trapFocusWithin`,
   `aria-modal`, `role="dialog"`). A row removed from a list, an error panel replacing the
   form that had focus, a wizard step swapped out — still yours.
4. **A field that starts its own write.** Inputs keep `[disabled]` on the premise that
   focus is on the button — false where the field's own `(change)`/`(blur)` starts the
   write (Enter fires `change` without leaving the field). Where `readonly` applies
   (text-entry inputs incl. `number` and date/time types, `<textarea>`) the fix is
   `[readonly]`, not `[appBusy]` and not a focus leg. Where it doesn't (`<select>`, checkbox,
   radio, `file`, `range`, `color`) no attribute locks without blurring, so the control must
   not be locked at all; serialize in the handler. Don't accept `[disabled]` plus a
   settle-time focus move there. `(input)` is excluded as draft-sync.

**Follow-up:**
- The convention: `frontend/.claude/CLAUDE.md`. Recurring instances: the focus plan docs
  under `docs/plans/`.
- A jsdom spec is not evidence for a busy-window claim — jsdom does not implement
  unfocus-on-disable. A claim about a *disabled* control needs a Chromium leg; a claim about
  a *destroyed* one may be pinned in jsdom.
- The e2e shape: `await expect(page.getByTestId('…')).toBeFocused()` at each leg
  (`e2e/operator-payouts.e2e.ts` › `keeps focus off body across the weather-refund confirm`),
  in the CI-run mocked suite.
- A spec asserting the *absence* of a move passes vacuously — ask whether it was mutation-checked.

**Default severity:** **Major** — a stranded focus is a WCAG AA failure; lean Major even
where the user can recover by tabbing from the top. **Blocker** for a strand with no
keyboard recovery (a focus trap still mounted with nothing focusable inside). **Minor** for a
missing leg on a path the diff itself makes rare. Not a finding for a BUSY-1 shape — CI
already failed it.

---

### RV-FE-10. A live region outlives the content it announces
**Gate:** Does every `aria-live` / `role="status"` / `<output>` region the diff writes
already exist in the DOM before the text it announces changes?
- [ ] the region is **outside** the `@if`/`@switch` branch it describes — a region created together with its message announces nothing on most screen-reader/browser combinations
- [ ] only the content branches; the element does not
- [ ] a *loading* surface uses `shared/load-announcer.ts` (`app-load-announcer`) rather than a hand-rolled region
- [ ] exactly one source per sentence on the surface: skeleton or visible "Loading…" copy beside an announcer is `aria-hidden="true"`, and `readyLabel` is empty wherever a persistent count region already speaks the outcome
- [ ] `readyLabel` is a static sentence, not a live count (a count re-announces on every later mutation)
- [ ] the "loaded" signal is fail-safe: the call site binds `[ready]` when it *reached its loaded branch*, never a "did it fail?" flag — enumerate the branches of the surface's `@if` chain and check the binding is true in exactly one of them
- [ ] the spec asserts element identity across the transition, not the presence of text

**Follow-up:**
- Enumerate the population rather than trusting the diff's own surfaces:
  `grep -rn 'aria-live\|role="status"\|<output>' frontend/src`.
- Announcing a load *failure* is a different item: the house pattern is `role="alert"` on
  the failure panel (insertion is the one case a live region is reliably announced without
  a prior mutation). Read the branch — a `role="status"` panel born holding its text, or no
  role at all, announces nothing; an `alert` elsewhere in the file may belong to a submit or
  delete flow. Never a live region per row of a list (assertive, re-announced on re-sort).
  Count which panels carry a role when you review; this item keeps no inventory.
- Ask whether the spec was mutation-checked: moving the region back inside its branch must
  fail it, and so must widening `[ready]` past the loaded branch (worked examples:
  `requests-tab.spec.ts`, `e2e/loading-announcements.e2e.ts`, the `[ready]` specs in
  `venue-map.spec.ts` / `my-bookings.spec.ts` / `set-password.spec.ts`).

**Default severity:** **Major** — invisible to every automated check including axe.
**Blocker** when the region is the only signal a state changed. **Minor** where a
persistent sibling region already announces the same outcome.

---

### RV-FE-11. An inline field error names its control, and `aria-invalid` means the value is wrong
**Gate:** Does every inline, field-scoped error the diff writes carry both `role="alert"`
and `[appFieldErrorFor]` naming its control — and does its `aria-invalid` claim match what
actually failed?
- [ ] the error element carries `[appFieldErrorFor]="<ctl>"` (`shared/field-error-for.ts`), never a hand-written `aria-describedby` — a dangling reference is only an axe *incomplete*, and `expectNoAxeViolations` (unit and `e2e/support/axe.ts`) reads `violations` only, so CI is blind to a missing or rotted association
- [ ] the directive sits on the **error element**, taking the control's template ref, so the association's lifetime is the error's own (a ref declared inside a `@for` body resolves per embedded view)
- [ ] `aria-invalid` is a claim about the entered value (ARIA21), not the request: an error reporting a failed *write* — a 403, a vanished row, an expired session — binds `[appFieldErrorForInvalidValue]="false"`. Ask what the user would have to retype to fix it; if nothing, the control is described but not marked invalid
- [ ] the error is genuinely field-scoped: form-, page- and action-level banners name no single control and stay alert-only (describing a button or a `class="hidden"` file input is the action-error pattern)
- [ ] a control that already carries a hint keeps it first: the directive appends, and announcement order follows the attribute's token order
- [ ] the spec asserts the take and the release, not the release alone

**Follow-up:**
- Nothing machine-checks this: no guard script, and axe cannot see it.
- Playwright's `toHaveAccessibleName` / `ariaSnapshot` use its own accname
  reimplementation, which disagrees with the browser (on
  `<label><span>Name</span><input><span role="alert">…</span></label>` Playwright folds
  the alert into the name; Chromium's real AX tree does not). When an accname question is
  load-bearing, read the CDP tree (`Accessibility.getPartialAXTree`) and treat
  `toHaveAccessibleDescription` as the assertion that holds.
- The convention: `frontend/.claude/CLAUDE.md` § Accessibility Requirements. The directive's
  TSDoc records its limits (no `aria-invalid` refcount; preservation assumes a static
  `aria-describedby`, not an `[attr.]` binding; ids are process-monotonic, so never assert a literal).

**Default severity:** **Major** — an unassociated field error is a WCAG 3.3.1 gap invisible
to CI. **Minor** for an `aria-invalid` over-claim on an operator-only surface; **Blocker**
if a hand-written association ships on a tourist-facing form.
