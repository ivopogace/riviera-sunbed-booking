# Riviera frontend overlay items

Repo-specific frontend bank items. Loaded by `riviera-review-overlay` and layered
onto whatever generic frontend bank the active review engine runs (today: the
`code-review` plugin) — walked after it.

Item format: gate → follow-up → default severity → skill framing. Invariant numbers
reference `CLAUDE.md`.

## Always-run (when scope is FE or Full-stack)

### RV-FE-1. Angular standards
**Gate:** Does new Angular code follow the project standards?
- [ ] standalone components (no `NgModule` for new code)
- [ ] `inject()` not constructor DI
- [ ] `@if`/`@for`/`@switch` not `*ngIf`/`*ngFor`
- [ ] `input()`/`output()` signal APIs not `@Input`/`@Output`
- [ ] `NgOptimizedImage` for new `<img>` (venue photos especially)
- **Greppable "don't write the obsolete thing" (Angular 22+):**
  - [ ] no redundant `standalone: true` (it's the default ≥ v20)
  - [ ] no explicit `changeDetection: OnPush` (it's the default ≥ v22)
  - [ ] `class`/`style` bindings, not `ngClass`/`ngStyle`
  - [ ] host bindings in the `host: {}` object, not `@HostBinding`/`@HostListener`
  - [ ] singleton services use `providedIn: 'root'` (or the `@Service` decorator, v22+)

**Follow-up:**
- Match the established style; document any deliberate deviation in the plan doc.
- Venue photos and beach imagery are image-heavy — use `NgOptimizedImage` and
  responsive sizing so the booking page stays fast on mobile.
- The greppable checks are fast to verify: `grep -rn "standalone: true\|ChangeDetectionStrategy.OnPush\|ngClass\|ngStyle\|@HostBinding\|@HostListener" frontend/src` should return nothing for new code.
- The authoritative, detailed Angular standards live in the in-repo
  `angular-developer` skill's `references/` (signals, forms, routing, testing,
  a11y) and mirror the Angular CLI's `get_best_practices` (v22). This bank checks
  the project-critical subset; defer to that skill for the full rules.

**Default severity:** Minor (consistency), Major if a non-standard pattern spreads.
**Skill framing:**
- Peer-review: "Each new component: standalone? `inject()`? new control flow? signal
  I/O? Any `ngClass`/`ngStyle`/`@HostBinding` or redundant `standalone: true`?"

---

### RV-FE-7. Styling is Tailwind, shared via directives, with no rendered drift (`riviera-tailwind`)
**Gate:** Does new/changed styling follow the project's Tailwind conventions?
- [ ] Tailwind utilities by default — new component styling isn't a fresh `.scss` **unless justified** (Tailwind-expressible → Tailwind; SCSS needs its stated why, per the `home.scss` scrim precedent)
- [ ] **migrate-on-touch:** a component the diff touches that still carries legacy component SCSS had that styling migrated to Tailwind in this same slice — or the SCSS is a justified holdout (scrim-class), or the defer was **maintainer-approved** (asked via `AskUserQuestion`, recorded with a follow-up issue — never self-granted; `riviera-tailwind` owns the rule + checklist)
- [ ] a reused surface/element is a shared directive/component (`shared/*-glass.ts`, `retry-button.ts`), **not** `@apply`/`@utility`
- [ ] a class a spec queries (`.set-tile.premium`, `.amenity-chip`, `.failure-title`, …) is retained as an inert marker after its styling moved to utilities
- [ ] a restyle/migration proves **no rendered drift** with a computed-style diff, not just the class list (the `*.contrast.spec.ts` are pure maths and can't see it)
- [ ] a new/changed interactive control meets the **44 × 44 px floor** (#605) — and the two halves of that check are **not** interchangeable (see Follow-up)

**Follow-up:**
- **The touch-target floor has a gating guard and a measuring sweep; neither is the other.** `check-touch-target.mjs` (#648, a `Repo hygiene (diff-scoped)` step and a `PostToolUse` hook) fails the build when a `<button>`/`<input>`/`<select>`/`<textarea>` declares neither `[appTouchTarget]` nor a reasoned `data-touch-exempt` — **both TT-1 and TT-2 gate**, so like BUSY-1 those lines are the build's finding and not yours (RV-STYLE-2's posture). But it proves only that somebody *declared* something. Two things it is blind to, which are exactly this item's: a declaration that is **false** (the directive is a no-op on a `display: inline` box, so `min-h-11` on a bare `<a>` changes nothing), and **every `<a>` in the app** — anchors are out of the guard's scope entirely and 53 stand undeclared by design. Rendered size is `frontend/e2e/touch-targets*.e2e.ts`'s to prove; a green guard on a surface the sweep never opens means nothing was measured.
- Sharing moves to the directive/component layer — Tailwind has no mixin and this repo does not `@apply`. Surface directives carry no `border-radius` (it resolves by stylesheet order, not `class` order).
- Don't flag a `getComputedStyle` `border-width` of `"1px"` for a `1.5px` border as a regression — Chromium snaps it, identically to the old SCSS. Diff against the SCSS's own computed values.
- Load `riviera-tailwind` for the full conventions + the SCSS→Tailwind migration checklist.

**Default severity:** Minor (consistency) for an idiom slip; **Major** for a restyle shipped with no drift check, or an `@apply`/new-`.scss` sharing pattern that spreads.
**Skill framing:**
- Peer-review: "Is styling Tailwind? Is a reused surface a directive (not `@apply`)? Are the test-hook classes kept? For a restyle — where's the computed-style no-drift check?"

---

### RV-FE-6. Forms use the modern API (Signal Forms / Reactive, never Template-driven)
**Gate:** Do new forms (booking, venue/beach-map editor, cancellation, guest-checkout
contact) use a modern forms API with typed, server-validated state?
- [ ] **Signal Forms** (`@angular/forms/signals`, stable v22+) preferred for new forms
- [ ] Reactive forms acceptable when Signal Forms don't fit
- [ ] **Template-driven** forms (`[(ngModel)]`-driven) for new work (violation)
- [ ] form types are explicit — no `any` on form values that cross the FE↔BE contract
- [ ] client validation is UX only; the **server** is authoritative (esp. money, dates, availability)

**Follow-up:**
- The MCP/`angular-developer` standard for Angular 22+ is Signal Forms first
  (signal-based state, type-safe field access, schema validation); Reactive next;
  Template-driven is discouraged for new code.
- Client-side validation never replaces server checks — price (minor units, #5),
  booking date / cutoff (`Europe/Tirane`, #4/#6), and set availability (#2) are all
  decided server-side. A form that "validates" availability locally and trusts it is
  a smell (see RV-FE-2).
- Defer to the `angular-developer` skill's forms reference for the full API.

**Default severity:** Major for a new Template-driven form or `any`-typed form values
on the contract; Minor for a Reactive-where-Signal-Forms-fit style choice.
**Skill framing:**
- Peer-review: "Is this a Signal Form or Reactive? Any Template-driven `ngModel`? Are
  the form value types explicit, and is the server still the authority for money/date/availability?"

---

### RV-FE-2. Beach-map availability can go stale — handle the conflict (invariant #2)
**Gate:** Does the seat picker treat its availability snapshot as **stale-able** and
recover gracefully when a chosen set was taken meanwhile?
- [ ] map refetches availability for the selected date (not cached indefinitely)
- [ ] booking submit handles a `409 SET_TAKEN` by refreshing the map and telling the user
- [ ] optimistic "selected" state with no server reconciliation (violation)
- [ ] taken sets visually distinct and not selectable

**Follow-up:**
- The server is the source of truth (invariant #2); the client map is a snapshot. A
  user can pick a set that someone else just took.
- On `409 SET_TAKEN`, don't dump a raw error — refresh availability, grey out the
  set, and prompt "that spot was just taken, pick another."
- Re-fetch availability when the user returns to the map or changes the date.

**Default severity:** Major for no conflict handling on submit; Minor for a missing
periodic refresh.
**Skill framing:**
- Peer-review: "What happens when the user books a set that got taken after the map
  loaded? Is there 409 handling that refreshes the map?"

---

### RV-FE-3. Money and dates rendered from the wire shape (invariants #5, #6)
**Gate:** Does the UI render money from minor units + currency, and dates as the
booking `LocalDate`, without doing money math in JS floats?
- [ ] amount formatted from integer minor units + currency code
- [ ] price arithmetic done in JS with floats (violation)
- [ ] booking date shown as a date (no implicit timezone shift)
- [ ] total recomputed client-side and trusted (smell — server is authoritative)

**Follow-up:**
- Format minor units to a localized currency string at the view edge; don't add/scale
  prices in JS floating point.
- The displayed total is for confirmation; the **server** computes the charged
  amount.
- A booking date is a calendar day — render it without applying a timezone offset
  that could roll it to the previous/next day.

**Default severity:** Major for client-side float money math that drives the charge;
Minor for display-only rounding.
**Skill framing:**
- Peer-review: "Where does the UI compute or format price? Floats? Is the charged
  amount the server's or the client's?"

---

### RV-FE-4. Payment UI trusts Stripe Elements, not the client (invariant #8)
**Gate:** Does the checkout use Stripe's hosted/Elements flow with only the
**publishable** key, and never self-report success to confirm a booking?
- [ ] Stripe Elements / Checkout with publishable key only
- [ ] any secret/restricted key in the frontend bundle (violation)
- [ ] booking shown as confirmed purely from the client redirect, with no server/webhook confirmation (violation)
- [ ] card data touched by app code instead of Stripe (violation — PCI)

**Follow-up:**
- Only the publishable key ships to the browser; secret keys stay server-side.
- The post-payment redirect updates UX optimistically but the **booking's confirmed
  state comes from the server** (driven by the verified webhook). Show a "finalizing"
  state and reconcile, rather than asserting paid from the redirect alone.
- Never collect raw card numbers in app inputs — that's Stripe Elements' job.

**Default severity:** **Blocker** for a secret key in the bundle or raw card handling;
Major for treating the redirect as proof of payment.
**Skill framing:**
- Peer-review: "Grep the bundle/config for secret keys. Does the confirmation screen
  trust the redirect or the server's booking state?"

---

### RV-FE-5. The visual seat picker is accessible
**Gate:** Is the beach-map seat picker usable beyond a pure pointer/visual
interaction?
- [ ] sets are keyboard-focusable and activatable
- [ ] taken vs available conveyed by more than color alone
- [ ] each selectable set has an accessible name (row/position, price, status)
- [ ] map is a `<canvas>`/SVG with no semantic fallback (concern)

**Follow-up:**
- Front-row vs back-row, taken vs free, premium pricing — encode with text/aria, not
  color only.
- A keyboard and screen-reader user should be able to find and book a set.

**Default severity:** Minor→Major depending on how central the picker is to the flow
(it is the core flow, so lean Major for keyboard inaccessibility).
**Skill framing:**
- Peer-review: "Can the seat picker be operated by keyboard? Is status color-only?"

---

### RV-FE-E2E. A user-facing frontend change carries the right Playwright e2e coverage
**Gate:** Does the diff add/adjust an e2e spec that (a) is authored to Playwright best
practice — **load the `playwright-cli` skill and judge the spec against it** — and (b) lives
in the **suite that will actually run it**?
- [ ] coverage exists for the changed flow (not just a unit spec)
- [ ] the spec follows `playwright-cli` best practice — role/label/test-id locators over CSS/text, web-first `expect` auto-waiting (no fixed sleeps), per-test isolation, no brittle selectors
- [ ] it is in the **correct** suite — mocked-a11y (`frontend/e2e/`, `npm run test:e2e:a11y`, **CI-run**) for render/a11y/interaction; real-backend (`frontend/e2e/real-backend/`, `npm run test:e2e`, **local-only**) for wiring / DB constraints / round-trip
- [ ] no strict-mode/timing flakiness (exact-vs-non-exact `getByLabel` under Signal Forms; `getByTestId` for option-folding selects)
- [ ] per-test unique data, no reliance on seeded rows
- [ ] asserts the read-back round-trip
- [ ] a backend-dependent spec is NOT parked where CI can't run it (leaving CI green-but-blind)

> **Project facts the generic skill can't know (apply on top of it):** there are **two
> suites** — the CI-run mocked-a11y suite (`frontend/e2e/`, API mocked via `page.route`,
> `playwright.a11y.config.ts` with `testIgnore: '**/real-backend/**'`) and the local-only
> real-backend suite (`frontend/e2e/real-backend/`, boots Spring Boot + Flyway Postgres,
> `playwright.config.ts`). Render/a11y/interaction → mocked suite (so CI covers it);
> wiring / real HTTP status / DB UNIQUE constraint / cross-feature round-trip → real-backend
> suite. A spec must live in exactly one tree. **In cloud sessions** never `playwright
> install` — a Chromium is pre-installed and both configs take `PW_CHROMIUM_EXECUTABLE`; the
> run recipe and the revision-mismatch trap (#164) live in `riviera-local-debug`.

**Follow-up:**
- A frontend flow change with **no** e2e consideration, or a backend-only spec dropped into
  the a11y dir / CI, is the common miss — pair this with the RV-PROC-1 routing check
  (`playwright-cli` must appear in *Skills consulted* for a frontend slice).
- New specs must pass `npm run lint` (lint now covers `e2e/**/*.ts`) and stay out of vitest
  (`*.e2e.ts`, not `*.spec.ts`).

**Default severity:** **Major** (Blocker if the change removes existing coverage or makes the
CI-run a11y suite green-but-blind to a real regression; Minor for a cosmetic-only tweak).
**Skill framing:**
- Peer-review: "Load `playwright-cli` and check the new/changed spec against its best
  practices. Which suite covers this change, and will CI run it? Are the locators and data
  per-test-safe, with no fixed sleeps?"

---

### RV-FE-8. No **new** cross-feature import (the FE mirror of RV-BE-3 / invariant #11)
**Gate:** Does the diff add a feature-folder import that isn't already in `riviera-frontend`'s
grandfathered debt table?
- [ ] no new `feature/ → other-feature/` import
- [ ] no new `shared/ → feature/` or `core/ → feature/` import — these break `shared`/`core` → nothing, the edges that keep the direction acyclic
- [ ] no new `pages/ → feature/` import
- [ ] a *removed* or *consolidated* existing edge is fine — and good
- [ ] a genuinely needed new edge is argued in the plan doc, not slipped in on the table's precedent

> **The table is a freeze, not a licence.** `riviera-frontend`'s residual table lists every
> cross-feature edge that exists — five behavioral edges since **#489** moved the published
> API-view vocabulary to `shared/`; each awaits its own slice, and the freeze stops the count
> growing meanwhile. **"`operator/` already imports `venue/`" is not an argument for a new
> import** — judge a new edge against the one-way rule on its merits.
>
> **Verify mechanically, not by eye** — feature folders are the direct children of
> `frontend/src/app`; `core/`, `shared/`, `pages/`, `environments/` are not. Match **both**
> `../feature/` and `../../feature/` (a `pages/home/` file reaching `venue/` nests twice, and
> a one-level pattern silently undercounts):
>
> ```
> grep -rn "from '\(\.\./\)\+\(admin\|auth\|booking\|operator\|pages\|venue\)/" \
>   --include=*.ts frontend/src/app | grep -v "\.spec\.ts"
> ```

**Follow-up:**
- A new edge that is really "two features need the same thing" → promote it per the taxonomy
  (pure → `shared/`, stateful/HTTP → `core/`), don't cross-import.
- Shrinking the set means updating `riviera-frontend`'s table in the same PR — a stale count
  reads as licence.
- **No ESLint boundary rule enforces this today**, which is why it is a review-bank item; with
  the residual down to five (#489), pinning it mechanically is the natural follow-up.

**Default severity:** **Major** for a new feature→feature import; **Blocker** for a new
`shared/ →` or `core/ → feature/` import (it reintroduces the cycle the one-way rule prevents).
Not a finding for a pre-existing edge the diff merely moves or consolidates.
**Skill framing:**
- Peer-review: "Run the grep. Is every cross-feature import in the diff already in
  `riviera-frontend`'s debt table? If the diff adds one, what is the argument — and is it
  really just 'the neighbours already do it'?"

---

### RV-FE-9. A transition that destroys the focused element moves focus (WCAG 2.4.3)
**Gate:** Does every transition the diff writes that **unmounts or disables the element focus is
sitting on** move focus somewhere deliberate, via `shared/focus-after-render.ts`'s `focusMover()`?
- [ ] a **confirm-before-destroy** surface has all three legs: **open** (onto the confirm's
      destructive button), **back-out** (onto the trigger it replaced), **settled** (onto the notice
      carrying the outcome) — success *and* failure
- [ ] a **modal/panel dismiss** returns focus to the trigger that opened it — re-rendering a trigger
      does not focus it
- [ ] a teardown that is **not** a confirm surface — a venue switch, a route change, a row removal,
      an error panel replacing a form — also moves focus, when what it tore down held it
- [ ] the move sits **inside** whatever staleness guard the write already has (`epoch`), so a
      superseded response moves nothing
- [ ] focus lands somewhere that says something, and the landing spot can take it (`tabindex="-1"`
      on a landmark; `focusMover()` adds one rather than letting the move be swallowed)
- [ ] a busy `<button>`/`<a>` uses `[appBusy]`, not `[disabled]` — CI gates the shapes it matches,
      but its vocabulary has deliberate holes (`loading`, `pending`, …), so read the next section
      before ticking this

**Don't walk the mechanical half by hand — but don't read a green step as an all-clear either.**
`node scripts/check-focus-posture.mjs --diff origin/main` (#621) runs from a `PostToolUse` hook while
the author types and as a step in `Repo hygiene (diff-scoped)`. It carries three rules in two
**opposite postures** — the BUSY pair gates (BUSY-2, #628, covers the #625 shape's text-entry half;
see blind spot 4), FOCUS-1 advises — and conflating them is the way to get this item wrong in both
directions:

- **BUSY-1 fails the build — for the shapes it can see.** A `[disabled]` bound to an in-flight flag
  on a `<button>`/`<a>` is the build's finding, not yours; by the time you read the diff CI has named
  the line, so don't re-flag it (RV-STYLE-2's posture). But it discriminates on a **curated
  vocabulary**, a deny-list with deliberate false negatives — `loading`, `pending`, `processing`,
  `updating` and `creating` are excluded by name because each reads as often as *state* as it does as
  busyness. So `[disabled]="loading()"` on a button is green **and** yours. The other silent shape is
  a **flag renamed in the `.ts`** while the template's `[disabled]` line stays untouched context —
  the guard judges the lines a diff adds, and that line is not one of them. (A binding the diff
  merely *moved* or re-indented is **not** in this set: the guards diff with `--unified=0` and no
  whitespace-ignoring flag, so a re-indented line is an added line and BUSY-1 does judge it.) Silence
  from BUSY-1 means "not one of the shapes I match", never "checked and fine".
- **FOCUS-1 prints and returns 0.** It advises; it does not gate. So a **green** hygiene job can sit
  on top of unread FOCUS-1 findings — read the step's *output*, not its exit code. It went advisory
  deliberately: "does this component move focus?" is a runtime property approximated by a regex over
  source, and three review passes each found a fresh false positive in the predicate.

**What the guard cannot judge — this is what the item is for:**

1. **Where focus should land.** The guard asks only whether a focus call site exists in the
   component. Landing on the page host is not the same answer as landing on the notice that says
   what happened, and only a human reads the surface.
2. **The *second* stranding flip on an already-compliant signal.** #626 narrowed FOCUS-1 from
   component scope to the **signal that gates each surface**, which is what let instance 14 hide
   (`payouts-tab` moved focus for its weather confirm, and its focus-**trapped** statement modal was
   then torn down by `resetForVenue()` with no leg). What remains is one step down: a signal is
   excused by **one** compliant flip site — deliberately, since a bulk state reset beside a compliant
   dismiss is not a bug — so a *second* stranding flip added beside a good one is unreported. So is a
   teardown written some other way: `update(…)`, a `linkedSignal`, anything that is not a `set(false)`
   the scanner recognises.
3. **Teardowns that are neither a confirm branch nor a focus trap.** FOCUS-1's trigger is an `@if`
   whose condition calls something matching `/confirm/i`, or one rendering a focus trap
   (`trapFocusWithin`, `aria-modal`, `role="dialog"`) — #626 added the second after instance 13, a
   modal **dismiss** that named no confirm flag anywhere. A surface that is neither still destroys
   focus and is still yours to check: a row removed from a list, an error panel replacing the form
   that had focus, a wizard step swapped out.
4. **The input carve-out's premise.** Inputs keep `[disabled]` and BUSY-1 allow-lists `button`/`a`
   only, on the stated grounds that *focus is on the button, never the field*. That holds wherever a
   button starts the write — and fails where the **field's own** `(change)`/`(blur)` starts it, which
   the guard cannot tell apart. `pricing-tab` was the live case (**#625**, fixed): Enter fired
   `change` without leaving the field, so the flag disabled the input focus was in; clicking to the
   next row disabled *that* one just as focus landed. **Where `readonly` applies** — text-entry
   inputs including `number` and the date/time types, plus `<textarea>` — **the fix is `[readonly]`**,
   not `[appBusy]` and not a focus leg: it blocks typing just as completely while keeping the field
   focused. **Where it doesn't** — `<select>`, checkbox, radio, `file`, `range`, `color` — no
   attribute locks without blurring, so the control must not be locked at all; serializing belongs in
   the handler. Don't accept `[disabled]` plus a settle-time focus move there: focus is on `<body>`
   for the whole request, and a leg afterwards only fixes where it lands. Ask where focus actually is
   when the flag flips, and whether `readonly` even applies to that control. **The text-entry half is
   machine-checked since #628**: BUSY-2 gates a `(change)`/`(blur)` + busy-`[disabled]` pairing on the
   `readonly`-lockable kinds. What stays this item's alone: the inert kinds, a field that commits per
   keystroke (`(input)` is excluded as draft-sync — the mirror case where a button starts the write),
   and whether the chosen lock is the *right* one for the surface.

**Follow-up:**
- The convention itself, both postures and the guard's flags: `frontend/.claude/CLAUDE.md`. The
  fifteen instances and why each recurred: #604, #614, #616, #621, #625 and their `docs/plans/` entries.
- **A jsdom spec is not evidence for a busy-window claim.** jsdom does not implement
  unfocus-on-disable (#614 R-1, re-confirmed by #616), so a unit spec can pass without the fix. A
  claim about a *disabled* control needs a Chromium leg; a claim about a *destroyed* one may be
  pinned in jsdom, which does model unmounting.
- The e2e shape to ask for is `await expect(page.getByTestId('…')).toBeFocused()` at each leg
  (`e2e/operator-payouts.e2e.ts` › `keeps focus off body across the weather-refund confirm`), in the
  CI-run mocked suite per RV-FE-E2E.
- A spec asserting the **absence** of a move (a superseded response, a change that destroys nothing)
  passes vacuously — ask whether it was mutation-checked.

**Default severity:** **Major** — a stranded focus is a WCAG AA failure on a shipped surface, and
`frontend/.claude/CLAUDE.md` states the rule as a MUST. Lean Major even where the user can recover by
tabbing from the top: on the console's long pages that is the whole page again, and a screen-reader
user gets no announcement that anything happened. **Blocker** only for a strand there is no keyboard
recovery from — a focus trap still mounted with nothing focusable left inside it. **Minor** for a
missing leg on a path the diff itself makes rare (a settle-on-failure leg where the failure needs a
server error). Not a finding at all for a BUSY-1 shape — CI already failed it and named the line.
**Skill framing:**
- Peer-review: "For each transition in this diff: does it destroy or disable the element focus is on?
  If so, where does focus go — all three legs for a confirm, and the trigger for a dismiss? Then the
  three the guard is blind to: does this component already move focus somewhere *else* (so FOCUS-1
  exempts it), is anything torn down here that isn't a confirm branch at all, and does any disabled
  field start its own write?"

---

### RV-FE-10. A live region outlives the content it announces (#741)
**Gate:** Does every `aria-live` / `role="status"` / `<output>` region the diff writes **already
exist in the DOM before the text it announces changes**?
- [ ] the region is **outside** the `@if`/`@switch` branch it describes — a region created together
      with its message announces nothing on most screen-reader/browser combinations
- [ ] only the **content** branches; the element does not
- [ ] a *loading* surface uses `shared/load-announcer.ts` (`app-load-announcer`) rather than a
      hand-rolled region — one shape, one place to fix
- [ ] the surface has exactly **one** source for a given sentence: the skeleton or visible
      "Loading…" copy beside an announcer is `aria-hidden="true"`, and a `readyLabel` is empty
      wherever a persistent count region already speaks the outcome
- [ ] `readyLabel` is a **static** sentence, not a live count — a count re-announces on every later
      mutation (a date change, an accepted request)
- [ ] the "loaded" signal is **fail-safe**: the call site says when it *reached its loaded branch*
      (`[ready]`), never when it failed. A "did it fail?" flag makes silence conditional on
      remembering every non-success exit, and the exits are always more numerous than they look —
      a 404, a partial read, a signed-out visitor, a post-erasure state. Enumerate the branches of
      the surface's `@if` chain and check the binding is true in exactly one of them
- [ ] the spec asserts **element identity across the transition**, not the presence of text

> **The trap this item exists for:** the text is always there, so a spec that reads it passes either
> way, and both the assertion and the comment beside it end up claiming an announcement nobody
> proved. #741 shipped that shape on **eight** surfaces at once — three of them named in the ticket,
> five found only by enumerating the mechanism (`grep -rn 'aria-live\|role="status"\|<output>'
> frontend/src`). `booking/booking-pay.ts`'s `pay-status` region and the #717/#718 count regions had
> the rule right the whole time; the loading surfaces never adopted it. angular.dev says the same
> thing under `@defer` › *Keep accessibility in mind*.
>
> **The fail-open trap, paid for once already.** PR #743's own review gate caught the `[ready]`
> rule above the hard way: the first cut took a `[failed]` flag, and three of eight call sites had
> a non-success exit nobody had thought to bind — the beach map's 404, My bookings' failed account
> read, the account page's signed-out visitor — each announcing "…loaded." over a panel saying the
> opposite. Announcing the failure itself is a *different* item: the house pattern is
> `role="alert"` on the failure panel, insertion being the one case a live region is reliably
> announced without a prior mutation. **Read the branch; never assume the panels handle it** — and
> read what kind of region it is, because two shapes announce nothing: a `role="status"` panel born
> holding its text, and no role at all. Read the *right* branch, too: an `alert` elsewhere in the
> file may belong to a submit or a delete flow, not to the load. Where the load's non-success
> branch is silent, `role="alert"` on the panel already in the diff is usually the right fix.
> What is **not** is a live region **per row** of a list — assertive, one interruption per failure,
> and re-announced when a re-sort moves the node; PR #743 shipped that for one round and reverted
> it. This item deliberately records **no inventory of which panels carry a role today** — that
> decays between reviews. Count when you review.
>
> **Ask whether the spec was mutation-checked.** Moving the region back inside its branch must fail
> it, and so must widening `[ready]` past the loaded branch — a passing assertion that cannot fail
> is the same false comfort in a new place (worked examples, all mutation-checked in PR #743:
> `requests-tab.spec.ts`, `e2e/loading-announcements.e2e.ts`, and the three `[ready]` specs in
> `venue-map.spec.ts` / `my-bookings.spec.ts` / `set-password.spec.ts`).

**Default severity:** **Major** — a loading state that says nothing is a WCAG AA failure on a shipped
surface, and it is invisible to every automated check including axe. **Blocker** when the region is
the *only* signal a state changed (a status a sighted user also cannot see). **Minor** where a
persistent sibling region already announces the same outcome and the new one is merely redundant.
**Skill framing:**
- Peer-review: "For each live region in this diff: is the element still there before and after the
  change it announces, or is it created along with its message? Which single region owns each
  sentence on that surface — and does anything else repeat it? What does it say when the load fails?"
