
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.
- **A busy `<button>` uses `[appBusy]`, never `[disabled]`.** A browser unfocuses a disabled element,
  so disabling the control the user just pressed strands focus on `<body>` for the whole request
  (WCAG 2.4.3). `shared/busy-action.ts` announces the same state via `aria-disabled` and blocks the
  activating click instead; style it with the `aria-disabled:` variant. Two carve-outs: **inputs keep
  `[disabled]`** (`aria-disabled` does not stop typing, and focus is on the button anyway), and so does
  anything disabled by **validity or state** rather than an in-flight write — a genuinely unavailable
  control should leave the tab order. Split a binding that mixes the two.
- **A transition that destroys the focused element must move focus deliberately**, via
  `shared/focus-after-render.ts`'s `focusMover()`. This is the repo's most-repeated bug class (#604,
  #614, #616); confirm-before-destroy surfaces need all three legs — open, back-out, and settled.
  **A focus-trapped modal is the same class**: dismissing one, or tearing it down from a state reset
  a venue switch or route change runs, destroys the element focus sits on just as a confirm prompt
  does.
- **A guard enforces both of the above while you type** (#621): `scripts/check-focus-posture.mjs`
  runs from a `PostToolUse` hook on every `Write`/`Edit` and again in CI over the PR diff, covering
  `frontend/src/app/**` templates — inline `template:` literals and external `.html` alike. **BUSY-1**
  flags a `[disabled]` bound to an in-flight flag on a `<button>`/`<a>` — the only controls `[appBusy]`
  can replace, so every other element is out of its reach, inputs included. **FOCUS-1** flags a branch
  that renders a confirm prompt or a focus trap and whose teardown moves focus nowhere; **rendering
  `<app-confirm-panel>`/`<app-confirm-with-reason>` does not excuse it**, since those own the open leg
  only and the back-out and settled legs are still yours. It is judged **per gating signal** (#624) —
  moving focus for one surface no longer excuses a second one the same component owns, which is how
  the payout statement modal's teardown shipped — so a reported line is the `set(false)` that strands
  focus, or the branch itself when the component moves focus nowhere at all. A signal is excused by
  **one** compliant flip site, because a bulk state reset beside a compliant dismiss is not a bug —
  so a *second* stranding flip added beside a good one goes unreported, as does a teardown written
  some other way (`update(…)`, a `linkedSignal`). Both are deliberate misses. Both rules are
  **diff-scoped**, so the standing
  tree never fails the repo — and only **BUSY-1 fails a build**: FOCUS-1 prints and returns 0,
  because "does this teardown move focus" is a runtime property a regex can only approximate, and a
  gate that fails correct code is the error direction this layer cannot afford. Treat a FOCUS-1 line
  as a prompt to check the three legs yourself. Run either by hand with
  `node scripts/check-focus-posture.mjs --files <path…>` (which judges those files whole, committed
  or not), or sweep the app with `--all`.
  BUSY-1 matches a curated vocabulary of busy-flag stems, so a novel flag name is a deliberate
  false negative — extend `BUSY_STEMS` rather than working around it. Note it does **not** exempt a
  `[disabled]` just because `[appBusy]` sits beside it: the native attribute still blurs the pressed
  control, so a genuine split has to put a validity expression on the `[disabled]` half.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Styling

- Tailwind v4 is the go-forward for component styling; component SCSS is being retired. Load
  the **`riviera-tailwind`** skill before writing or refactoring any Tailwind — it owns the
  share-via-directive-not-`@apply` rule, the test-hook-class convention, and the no-drift check.

## Comments

- **Inline comments are one line, or they are not written.** If it needs two, the comment is doing
  work the code should do — name the constant, extract the function, sharpen the type — then delete
  it. Default to zero inline comments in a function; reach for one only when the *why* is genuinely
  unavailable from the code (an ordering constraint, an ARIA/spec rule, a deliberate deviation).
- **TSDoc (`/** … */`) on a component, service, directive or exported type is exempt** from the
  one-line rule — that is the documented surface, so the explanation belongs there rather than
  scattered through the body. **Exempt is not unbounded**, though: TSDoc states the contract, not
  the changelog. No issue numbers (`git blame` holds provenance), no "it used to / the alternative
  would have" decision history, and roughly 6 lines on a type, 3 on a member. When the rationale is
  load-bearing, relocate it — an ADR, or the feature's plan doc — and leave a one-line pointer.
  Keep short operational warnings a reader needs at the point of use. Canonical statement, with the
  numbers behind it: `riviera-java-conventions` §6d.
- Enforced at the review gate as **RV-STYLE-1**; this section exists so the first draft already
  complies instead of being trimmed later.
- **A guard enforces it while you type** (#529): `scripts/check-inline-comments.mjs` runs from a
  `PostToolUse` hook on every `Write`/`Edit` and again in CI over the PR diff, covering `.ts`,
  `.tsx`, `.js`, `.scss`, `.css` and `.html`. It is **diff-scoped** — it judges only lines your
  diff adds, so the pre-existing multi-line blocks in `styles.scss` stay untouched and so should
  yours. Run it by hand with `node scripts/check-inline-comments.mjs --files <path…>`. Scope
  details and the two exemptions: `riviera-java-conventions` §6c.

## Unit tests

- **The Vitest clock is frozen** at Monday 2026-06-15 midday Europe/Tirane
  (`src/test-setup.ts`, wired via the `test` target's `setupFiles`): `new Date()` in a spec
  is deterministic and never the machine's real calendar. Never write a spec that needs the
  real "today"; a spec that genuinely needs the real clock opts out with `vi.useRealTimers()`.
  Only `Date` is faked — real timers and `fakeAsync` are untouched. (Origin: a hardcoded
  `'2026-08-01'` literal collided with the real calendar date and turned CI red for a day.)

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
