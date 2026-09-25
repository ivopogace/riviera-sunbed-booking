Angular 22 idioms for `frontend/`. Structure is `riviera-frontend`'s; styling `riviera-tailwind`'s.

## TypeScript

- Strict; prefer inference when obvious. No `any`; `unknown` when uncertain.

## Angular

- Standalone components; do NOT write `standalone: true` or `changeDetection: OnPush` (both defaults).
- Host bindings in the decorator's `host` object, not `@HostBinding`/`@HostListener`.
- `NgOptimizedImage` for static images.
- Unsure how an Angular API behaves? Verify via the angular-cli MCP's `search_documentation`
  (v22), never from memory — also for a review finding that hinges on framework behaviour.
- Small components; inline templates when small. `input()`/`output()`/`model()`, not decorators.
- Signals for state, `computed()` derived, `linkedSignal()` for multi-source derived state;
  `update`/`set`, never `mutate`.
- Signal Forms (`@angular/forms/signals`) for new forms, else Reactive; never Template-driven.
- `class`/`style` bindings, not `ngClass`/`ngStyle`. Native control flow (`@if`/`@for`/`@switch`).
- Services: `providedIn: 'root'` (prefer `@Service`); `inject()`, not constructor injection.

## Accessibility

- Pass axe + WCAG AA.
- **A busy `<button>` uses `[appBusy]` (`shared/busy-action.ts`), never `[disabled]`** —
  disabling the pressed control strands focus on `<body>`. Inputs and validity-disabled
  controls keep `[disabled]`; a self-committing field uses `[readonly]` where it applies.
  Decision table: RV-FE-9.
- **A transition that destroys the focused element moves focus** via
  `shared/focus-after-render.ts`'s `focusMover()` on all three legs (open, back-out, settled).
- **An inline field error carries `role="alert"` AND `[appFieldErrorFor]`**
  (`shared/field-error-for.ts`), never a hand-written `aria-describedby`. A failed-write error
  (403, expired session) binds `[appFieldErrorForInvalidValue]="false"`; form/page/action
  banners stay alert-only. RV-FE-11.
- **Every interactive control declares the 44 × 44 px floor**: `[appTouchTarget]`
  (`shared/touch-target.ts`) or `data-touch-exempt="<reason>"` (`riviera-tailwind` rule 4).
- **Buttons get the 3px focus ring from `tailwind.css`'s base layer**; `focus-visible:`
  utilities only change colour/offset, never `outline-none` (`riviera-tailwind` rule 6).
- Guards (`PostToolUse` hook + CI; by hand `--files <path…>` or `--all`):
  `scripts/check-focus-posture.mjs` (BUSY rules gate, FOCUS-1 is advisory),
  `scripts/check-touch-target.mjs` (proves a declaration, not a size;
  `frontend/e2e/touch-targets*.e2e.ts` measures).

## Styling

Tailwind v4; SCSS only with a stated justification (`riviera-tailwind`).

## Comments

Keep a comment, TSDoc or skill line only if a fresh session would act differently
(`riviera-java-conventions` §6c/§6d; guard: `scripts/check-inline-comments.mjs`). TSDoc keeps
§6d's budget: 6 text lines for a type, 3 for a member.

## Unit tests

- The Vitest clock is frozen at Monday 2026-06-15 midday Europe/Tirane (`src/test-setup.ts`);
  only `Date` is faked. Full fake timers: `vi.useFakeTimers()`, restore with `freezeClock()`
  (`src/testing/freeze-clock.ts`), never `vi.useRealTimers()` (lint + `afterEach` fail it).
- The setup file is registered in `vitest-base.config.ts`, not `angular.json` (ADR-0014).
  Shared helpers: `src/testing/`.
- `isolate` stays `false`: files in a worker share one jsdom; a spec restores anything global
  it mutates.
