
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
- Use `NgOptimizedImage` for all static images (not for inline base64 images).
- **Uncertain about an Angular API's behavior** (signals, `linkedSignal`, forms, lifecycle,
  router)? Verify against angular.dev via the angular-cli MCP's `search_documentation`
  (version 22) — never from memory; training data trails a v22 codebase. Same when a review
  finding hinges on a framework-behavior claim.

## Accessibility Requirements

- It MUST pass all AXE checks and all WCAG AA minimums (focus management, color
  contrast, ARIA attributes).
- **A busy `<button>` uses `[appBusy]` (`shared/busy-action.ts`), never `[disabled]`** —
  disabling the pressed control strands focus on `<body>` (WCAG 2.4.3). Inputs and
  validity/state-disabled controls keep `[disabled]`. A field that commits itself via
  `(change)`/`(blur)` uses `[readonly]` where readonly applies (text-entry types +
  `<textarea>`); the inert kinds (`<select>`, checkbox, radio, `file`, `range`,
  `color`) serialize in the handler instead of locking. The full decision table:
  `riviera-review-overlay` `references/frontend-conventions.md`.
- **A transition that destroys the focused element must move focus deliberately**,
  via `shared/focus-after-render.ts`'s `focusMover()`, on all three legs — open,
  back-out, and settled. A focus-trapped modal's teardown counts as a surface.
  This is the repo's most-repeated bug class; reviewed as RV-FE-9.
- **Every interactive control declares the 44 × 44 px floor**: `[appTouchTarget]`
  (`shared/touch-target.ts`), or `data-touch-exempt="<reason>"` on the control or an
  ancestor (three documented exemption classes — see `riviera-tailwind`). `<a>` is
  out of scope by design.
- **Guards enforce these while you type** (`PostToolUse` hooks + CI, diff-scoped):
  `scripts/check-focus-posture.mjs` — the BUSY rules fail a build (novel busy-flag
  names: extend its `BUSY_STEMS`, don't work around it); FOCUS-1 is advisory, so
  treat a reported line as a prompt to check the three legs yourself — and
  `scripts/check-touch-target.mjs` — TT-1/TT-2 fail a build, but a green guard proves
  a declaration exists, not a rendered size; `frontend/e2e/touch-targets*.e2e.ts`
  measures. Run either by hand with `--files <path…>` or `--all`.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms; otherwise Reactive forms, never Template-driven
- Do NOT use `ngClass`/`ngStyle`; use `class`/`style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state, `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Styling

- Tailwind v4 is the **default for new styling**: whenever Tailwind can express it, style
  with utilities, not SCSS. SCSS is not obsolete — it stays legitimate for what Tailwind
  can't express cleanly (the retired `home.scss` scrim is the historical example — none
  remain in-tree), with the justification stated; an
  **unjustified** fresh `.scss` is a review finding. **Migrate on touch:** a slice that
  touches a component still carrying legacy SCSS migrates that styling to Tailwind in the
  same slice; deferral only by **asking the maintainer** (`AskUserQuestion`), recorded
  with a follow-up issue — `riviera-tailwind` owns the rule. Load **`riviera-tailwind`**
  before styling anything.

## Comments

- **Inline comments are one line, or they are not written**; default to zero per
  function. TSDoc on a documented surface is exempt, but states the contract, not the
  changelog (no issue numbers, no decision history). Canonical statement:
  `riviera-java-conventions` §6c–6d. Reviewed as RV-STYLE-1 and enforced by
  `scripts/check-inline-comments.mjs` (`PostToolUse` hook + CI; diff-scoped for
  tracked files, whole-file for new ones).

## Unit tests

- **The Vitest clock is frozen** at Monday 2026-06-15 midday Europe/Tirane, before
  **every test file** (`src/test-setup.ts`): `new Date()` in a spec is deterministic,
  never the machine's real calendar. Never write a spec that needs the real "today".
  Only `Date` is faked, so real timers already work — a spec needing **full** fake
  timers calls `vi.useFakeTimers()` and restores with **`freezeClock()`**
  (**`src/testing/freeze-clock.ts`**), never `vi.useRealTimers()`: that unfakes `Date` as
  well and leaves every later test in the file on the machine calendar. Two guards, not a
  convention — `no-restricted-syntax` fails the lint on `vi.useRealTimers()` anywhere
  under `src/`, and `src/test-setup.ts`'s `afterEach` fails the **exact test** that leaves
  the clock off the frozen instant.
- **The setup file is registered in `vitest-base.config.ts`, not `angular.json`.** The
  builder pre-bundles its `setupFiles` as esbuild entry points, and an entry point is a
  re-export shim whenever it is shared *or* coverage is on (CI runs only the coverage
  variant) — so Vitest's per-file re-import reaches the shim and the body behind it runs
  **once per worker process**, handing each file whatever the last one left on the clock
  (ADR-0014, #663). Don't move it back; `freeze-clock.spec.ts` fails if you do. Shared
  test helpers live in `src/testing/`, and `freeze-clock.ts` must stay **stateless** —
  specs import it, so it lives in a chunk evaluated once per worker.
- **`isolate` stays `false`** (the `@angular/build:unit-test` default): test files in a
  worker share one jsdom and one module graph. `src/test-setup.ts` re-establishes the
  global posture per file; anything else a spec mutates globally, it restores itself.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
