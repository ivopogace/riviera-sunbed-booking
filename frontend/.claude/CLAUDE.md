
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
- **TSDoc (`/** … */`) on a component, service, directive or exported type is exempt** — that is the
  documented surface. Put the long explanation there, not scattered through the body.
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
