Angular 22 idioms for `frontend/`. Structure (which folder, import direction, routing) is
`riviera-frontend`'s call; styling is `riviera-tailwind`'s. This file is the how.

## TypeScript

- Strict type checking; prefer inference when the type is obvious.
- No `any`; use `unknown` when the type is uncertain.

## Angular

- Standalone components only. Do NOT set `standalone: true` (the default since v20) or
  `changeDetection: OnPush` (the default since v22) in decorators.
- No `@HostBinding`/`@HostListener`: put host bindings in the decorator's `host` object.
- `NgOptimizedImage` for static images (not inline base64).
- Unsure how an Angular API behaves (signals, `linkedSignal`, forms, lifecycle, router)?
  Verify against angular.dev via the angular-cli MCP's `search_documentation` (version 22),
  never from memory — also when a review finding hinges on a framework-behavior claim.

### Components and state

- Small, single-responsibility components; inline templates when small.
- `input()`/`output()` functions, not decorators; `model()` for two-way `[(prop)]`.
- Signals for state, `computed()` for derived state, `linkedSignal()` for state derived from
  several reactive sources; `update`/`set`, never `mutate`.
- Signal Forms (`@angular/forms/signals`) for new forms, otherwise Reactive; never
  Template-driven.
- `class`/`style` bindings, not `ngClass`/`ngStyle`; external template/style paths are
  relative to the component file.

### Templates

- Keep logic out of templates; native control flow (`@if`, `@for`, `@switch`), the async
  pipe for observables. Do not assume globals like `new Date()` are available.

### Services

- `providedIn: 'root'` singletons — prefer the `@Service` decorator (v22+) for new ones.
- `inject()`, not constructor injection.

## Accessibility Requirements

- Must pass all axe checks and WCAG AA minimums (focus management, contrast, ARIA).
- **A busy `<button>` uses `[appBusy]` (`shared/busy-action.ts`), never `[disabled]`** —
  disabling the pressed control strands focus on `<body>` (WCAG 2.4.3). Inputs and
  validity-disabled controls keep `[disabled]`; a self-committing field uses `[readonly]`
  where it applies and serializes in the handler otherwise. Decision table: RV-FE-9 in
  `riviera-review-overlay` `references/frontend-conventions.md`.
- **A transition that destroys the focused element moves focus deliberately** via
  `shared/focus-after-render.ts`'s `focusMover()`, on all three legs — open, back-out,
  settled. A focus-trapped modal's teardown counts. RV-FE-9.
- **An inline field error carries `role="alert"` AND `[appFieldErrorFor]`**
  (`shared/field-error-for.ts`) naming its control — never a hand-written
  `aria-describedby`. An error about a failed *write* (403, expired session) binds
  `[appFieldErrorForInvalidValue]="false"`; form-, page- and action-level banners stay
  alert-only. RV-FE-11.
- **Every interactive control declares the 44 × 44 px floor**: `[appTouchTarget]`
  (`shared/touch-target.ts`) or `data-touch-exempt="<reason>"` (`riviera-tailwind` lists the
  exemption classes). `<a>` is out of scope by design.
- **Buttons get the 3px focus ring from `tailwind.css`'s base layer**: `focus-visible:`
  utilities only to change colour or offset, never `outline-none` (`riviera-tailwind` rule 6).
- **Guards** (`PostToolUse` hooks + CI, diff-scoped; by hand `--files <path…>` or `--all`):
  `scripts/check-focus-posture.mjs` — BUSY rules fail the build (a novel busy-flag name
  extends `BUSY_STEMS`, no workarounds), FOCUS-1 is advisory: check the three legs yourself.
  `scripts/check-touch-target.mjs` — proves a declaration exists, not a rendered size;
  `frontend/e2e/touch-targets*.e2e.ts` measures.

## Styling

Tailwind v4 by default; SCSS only for what Tailwind can't express, with the justification
stated. **Migrate on touch:** a slice touching a component with legacy SCSS migrates it in
the same slice; deferral only by asking the maintainer, recorded as a follow-up issue. Load
`riviera-tailwind` before styling anything.

## Comments

**Inline comments are one line, or they are not written**; default to zero per function.
TSDoc states the contract, not the changelog (no issue numbers, no decision history) —
`riviera-java-conventions` §6c–6d. RV-STYLE-1, enforced by `scripts/check-inline-comments.mjs`.

## Unit tests

- **The Vitest clock is frozen** at Monday 2026-06-15 midday Europe/Tirane before every
  test file (`src/test-setup.ts`); never write a spec that needs the real "today". Only
  `Date` is faked. A spec needing full fake timers calls `vi.useFakeTimers()` and restores
  with `freezeClock()` (`src/testing/freeze-clock.ts`), never `vi.useRealTimers()` — a lint
  rule and the setup file's `afterEach` both fail it.
- **The setup file is registered in `vitest-base.config.ts`, not `angular.json`** — the
  builder would run it once per worker instead of per file (ADR-0014; `freeze-clock.spec.ts`
  fails if moved). Shared helpers live in `src/testing/`; `freeze-clock.ts` stays stateless.
- **`isolate` stays `false`**: files in a worker share one jsdom and module graph. The setup
  file resets the global posture per file; anything else a spec mutates globally, it
  restores itself.
