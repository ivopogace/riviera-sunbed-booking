# Riviera frontend overlay items

Gate → follow-up → default severity. Invariant numbers: `CLAUDE.md`.

### RV-FE-1. Angular standards — Minor (Major if a non-standard pattern spreads)
Standalone, `inject()`, `@if`/`@for`/`@switch`, `input()`/`output()`, `NgOptimizedImage` for
new `<img>`, no `standalone: true`, no `changeDetection: OnPush`, `class`/`style` not
`ngClass`/`ngStyle`, `host: {}` not `@HostBinding`/`@HostListener`, `providedIn: 'root'`/`@Service`.
`grep -rn "standalone: true\|ChangeDetectionStrategy.OnPush\|ngClass\|ngStyle\|@HostBinding\|@HostListener" frontend/src`
returns nothing for new code. Deviations documented in the plan.

### RV-FE-7. Styling is Tailwind, shared via directives, no drift (`riviera-tailwind`) — Minor; Major for a restyle with no drift check or an `@apply`/new-`.scss` pattern
No new `.scss` without a stated why; reuse via directive/component, not `@apply`/`@utility`; a
class a spec queries is retained as an inert marker; a restyle proves no drift with a
computed-style diff (contrast specs are pure maths); interactive controls meet 44 × 44 px.
`check-touch-target.mjs` proves only a declaration and ignores `<a>`;
`frontend/e2e/touch-targets*.e2e.ts` measures.
Surface directives carry no `border-radius`. A `border-width` of `"1px"` for a `1.5px` border
is Chromium snapping, not a regression.

### RV-FE-6. Forms — Major for Template-driven or `any`-typed contract values
Signal Forms preferred, Reactive acceptable, never Template-driven; explicit types on
contract values; client validation is UX only — price, date/cutoff and availability are
decided server-side.

### RV-FE-2. Beach-map availability goes stale (#2) — Major (Minor for no periodic refresh)
Map refetches availability for the selected date; submit handles `409 SET_TAKEN` by refreshing
the map and telling the user; no optimistic "selected" state without reconciliation; taken
sets visually distinct and unselectable.

### RV-FE-3. Money and dates from the wire shape (#5, #6) — Major
Format minor units + currency at the view edge; no float price arithmetic driving a charge;
booking date rendered as a calendar day with no timezone shift; a client-computed total is for
display only.

### RV-FE-4. Payment UI (#8) — **Blocker** for a secret key in the bundle or raw card handling; Major for treating the redirect as proof
Stripe Elements/Checkout with the publishable key only; confirmed state comes from the server
(show "finalizing" and reconcile). Grep the bundle/config for secret keys.

### RV-FE-5. Seat picker accessibility — Major
Sets keyboard-focusable and activatable; taken vs available not by colour alone; each set has
an accessible name (row/position, price, status); no `<canvas>`/SVG without a semantic fallback.

### RV-FE-E2E. E2E coverage in the right suite — Major (Blocker if coverage is removed or CI goes green-but-blind)
A user-facing change carries an e2e spec: role/label/test-id locators, web-first `expect`,
no fixed sleeps, per-test unique data, asserts the read-back round-trip. Two suites, a spec
lives in exactly one: mocked-a11y (`frontend/e2e/`, `page.route`, `playwright.a11y.config.ts`,
CI-run) for render/a11y/interaction; real-backend (`frontend/e2e/real-backend/`,
`playwright.config.ts`, local-only) for wiring/DB constraints/round-trip. A backend-dependent
spec is never parked where CI can't run it. Specs are `*.e2e.ts` (not `*.spec.ts`), pass
`npm run lint`; `playwright-cli` appears in *Skills consulted*. Cloud: never `playwright install`
(`riviera-local-debug`).

### RV-FE-8. No new cross-feature import — Major; **Blocker** for `shared/ →` or `core/ → feature/`
Feature folders are the direct children of `frontend/src/app` other than `core/`, `shared/`,
`pages/`, `environments/`. Pre-existing edges are frozen in `riviera-frontend`'s table; a
moved/consolidated edge is fine; a new one is argued in the plan, never slipped in on
precedent. Verify:

```
grep -rn "from '\(\.\./\)\+\(admin\|auth\|booking\|operator\|pages\|venue\)/" \
  --include=*.ts frontend/src/app | grep -v "\.spec\.ts"
```

Promote shared needs: pure → `shared/`, stateful/HTTP → `core/`. No ESLint rule enforces this.

### RV-FE-9. A transition that destroys the focused element moves focus (WCAG 2.4.3) — Major; **Blocker** for a strand with no keyboard recovery; Minor for a rare path
Via `shared/focus-after-render.ts`'s `focusMover()`. A confirm-before-destroy surface has all
three legs: **open** (onto the destructive button), **back-out** (onto the trigger), **settled**
(onto the notice, success and failure). A modal/panel dismiss returns focus to its trigger. Any
other teardown that held focus (venue switch, route change, row removal, error panel
replacing a form) also moves it. The move sits inside the write's staleness guard (`epoch`).
The landing spot says something and can take focus (`tabindex="-1"`; `focusMover()` adds one).
A busy `<button>`/`<a>` uses `[appBusy]`, not `[disabled]`.

Guard `scripts/check-focus-posture.mjs` (hook + CI): **BUSY-1** fails the build for
`[disabled]` bound to an in-flight flag — but only for names outside `loading`, `pending`,
`processing`, `updating`, `creating`, and only on added lines; silence is not "checked".
**BUSY-2** gates `(change)`/`(blur)` + busy-`[disabled]` on `readonly`-lockable inputs.
**FOCUS-1** is advisory (prints, exits 0) and triggers only on `@if` conditions matching
`/confirm/i` or a focus trap — read its output. Yours to judge: where focus lands; a second
stranding flip on an already-excused signal or a teardown written as `update(…)`/`linkedSignal`;
teardowns that are neither confirm nor trap; a field whose own `(change)`/`(blur)` starts the
write — `[readonly]` where it applies (text/number/date inputs, `<textarea>`), otherwise
(`<select>`, checkbox, radio, `file`, `range`, `color`) don't lock at all, serialize in the
handler.

A jsdom spec is not evidence for a *disabled*-control claim (jsdom lacks unfocus-on-disable);
a *destroyed*-element claim may be pinned in jsdom. E2E shape:
`await expect(page.getByTestId('…')).toBeFocused()` per leg
(`e2e/operator-payouts.e2e.ts` › `keeps focus off body across the weather-refund confirm`). A
spec asserting the *absence* of a move passes vacuously — ask if it was mutation-checked.

### RV-FE-10. A live region outlives its content — Major (invisible to axe); **Blocker** when it is the only signal; Minor with a persistent sibling region
The `aria-live`/`role="status"`/`<output>` region exists in the DOM before its text changes:
outside the `@if`/`@switch` branch it describes; only the content branches. Loading surfaces
use `shared/load-announcer.ts` (`app-load-announcer`); skeleton/"Loading…" copy beside it is
`aria-hidden="true"`; `readyLabel` is a static sentence (a count re-announces on every
mutation) and empty where a persistent count region already speaks; `[ready]` binds when the
surface *reached its loaded branch*, never a "did it fail?" flag — enumerate the `@if` chain
and check it is true in exactly one branch. The spec asserts element identity across the
transition, not text presence, and was mutation-checked (worked examples:
`requests-tab.spec.ts`, `e2e/loading-announcements.e2e.ts`, the `[ready]` specs in
`venue-map.spec.ts` / `my-bookings.spec.ts` / `set-password.spec.ts`).
Population: `grep -rn 'aria-live\|role="status"\|<output>' frontend/src`. A load *failure*
is `role="alert"` on the failure panel (insertion is announced); never a live region per list row.

### RV-FE-11. An inline field error names its control — Major; **Blocker** for a hand-written association on a tourist-facing form; Minor for an `aria-invalid` over-claim on an operator surface
`role="alert"` AND `[appFieldErrorFor]="<ctl>"` (`shared/field-error-for.ts`) on the **error
element**, never a hand-written `aria-describedby` (a dangling reference is only an axe
*incomplete*, invisible to `expectNoAxeViolations`). `aria-invalid` is a claim about the entered
value: a failed-*write* error (403, vanished row, expired session) binds
`[appFieldErrorForInvalidValue]="false"`. Form/page/action banners stay alert-only. An existing
hint stays first. The spec asserts the take and the release. Playwright's
`toHaveAccessibleName`/`ariaSnapshot` disagree with Chromium's AX tree on alerts inside
`<label>`; when load-bearing, read the CDP tree (`Accessibility.getPartialAXTree`) and rely on
`toHaveAccessibleDescription`. Ids are process-monotonic — never assert a literal.
