---
name: riviera-tailwind
description: The how-to-write-Tailwind authority for the riviera-sunbed-booking frontend (Tailwind v4, Angular 22). Load BEFORE writing or refactoring any Tailwind under frontend/src — a new styled component, a restyle, or an SCSS→Tailwind migration. Tailwind is the locked go-forward for styling (SCSS is being retired). Complements riviera-frontend (which folder a file goes in) and angular-developer (generic Angular+Tailwind technique); RV-FE-* checks the result.
---

# Riviera Tailwind conventions

**Announce at start:** "Loaded riviera-tailwind — applying the project's directive-sharing, no-`@apply`, no-drift Tailwind idioms."

## Why this skill exists

Tailwind v4 is the **go-forward** for styling here; component SCSS is being retired
(precedent: `shared/retry-button.ts`, then the beach-map migration — the `shared/*-glass`
+ `amenity-chip` + `failure-panel` directives and 7 migrated components). Those files are
worked examples: **read the nearest one before styling**, don't re-derive the pattern.
This skill states only the few decisions and traps the *code can't show you*.

## The rules

1. **Share at the component/directive layer — NEVER `@apply` or `@utility`.** Tailwind has
   no mixin; this repo deliberately does not fake one in CSS. A reused *surface* is an
   attribute directive (`shared/card-glass.ts`, `panel-glass.ts`); a reused *element* is a
   component (`retry-button.ts`) or variant directive (`amenity-chip.ts`). The directive's
   host `class` string is scanned by Tailwind, so the utilities generate normally.
2. **Keep the old semantic class as an inert marker when a test queries it.** Unit/e2e specs
   query `.set-tile.premium`, `.amenity-chip`, `.failure-title`, etc. Retain those class
   names (on the element or the directive host) so a styling-only change never forces a
   test rewrite; the utilities do the styling beside them.
3. **Surface directives carry no `border-radius`** (and no padding). Tailwind resolves two
   competing `border-radius` utilities by **stylesheet order, not `class` order**, so a
   directive `rounded-[26px]` + a consumer `rounded-full` is a coin-flip. Each consumer sets
   its own radius. (`panel-glass.ts` documents this.)
4. **Idiom quick-reference** (match the exemplars, don't reinvent):
   - `text-[14px]`, **not** `text-sm` — named sizes bundle a `line-height` and drift.
   - Arbitrary variants for what utilities/plugins don't cover (no plugins — locked stack):
     `[scrollbar-width:none]`, `[&::-webkit-scrollbar]:hidden`, `[&.premium]:bg-[#…]`.
   - `[transition:background_0.15s_ease,transform_0.12s_ease]` to keep **per-property**
     durations exact (plain `transition` forces one duration + Tailwind's easing ≠ `ease`).
   - `hover:` already compiles under `@media (hover:hover)` in v4; `motion-reduce:` replaces
     the `prefers-reduced-motion` guard.
   - Gradient CSS-var background = `bg-(image:--riv-photo-grad)`; bare `bg-(--x)` is a *color*.
   - `host: { style: '--foo: …' }` for a static custom property that drives layout.

## No visual/colour drift (the hard rule)

Prove no drift by diffing **computed styles** (`getComputedStyle` in Playwright /
`test:e2e:a11y`), not the class list — the `*.contrast.spec.ts` files are pure maths and
can't catch a colour that's wrong-but-still-AA, or a dropped `cursor`/`transition`.

**GOTCHA — border-width snapping:** Chromium's `getComputedStyle` returns the
device-pixel-**snapped used value** for `border-width`, so a `1.5px` border reads `"1px"`.
That is **identical to the old SCSS** `1.5px` (the compiled `border-width:1.5px` is
byte-equal) — assert the snapped value, don't chase it as a regression.

## SCSS→Tailwind migration checklist

1. Inventory the shared SCSS recipes the file uses **and their blast radius** (grep every
   `@include`/`@extend`). This decides scope.
2. Pick scope: **narrow** (leave shared recipes as SCSS, Tailwind only the file's own
   styles) or **full** (port the recipe to a directive/component and update every consumer).
   Ask the user when the recipe is widely shared — it changes the diff size a lot.
3. Retain test-hook classes (rule 2). New shared primitive → give it a `.spec.ts`.
4. Verify: `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e:a11y` (the mocked
   suite CI runs — **not** `test:e2e`, which is the real-backend one), plus the computed-style
   diff above. Fix regressions; never retune a test to match one.

## Red flags

| Thought | Reality |
|---|---|
| "I'll `@apply` the shared styles." | No `@apply`/`@utility` here. Extract a directive/component. |
| "Drop the `.set-tile` class, it's just styling now." | A spec queries it — keep it as an inert marker. |
| "Bundle `rounded-[26px]` into the glass directive." | Radius resolves by stylesheet order — unbundle it. |
| "`text-sm` is 14px, close enough." | It also sets line-height → drift. Use `text-[14px]`. |
| "border-width is 1px now — I broke it." | Chromium snaps 1.5px→"1px"; the SCSS did too. Not a regression. |
| "Classes look right, ship it." | Diff computed styles; contrast specs can't see drift. |
| "`bg-(--riv-photo-grad)` for the gradient." | That's a color. Use `bg-(image:--riv-photo-grad)`. |

## When NOT to use

- Deciding *which folder* a file/primitive goes in → `riviera-frontend`.
- Generic Angular+Tailwind technique (signals, host bindings) → `angular-developer` + `frontend/.claude/CLAUDE.md`.
- Backend/SCSS-only work.

## Integration

- **`riviera-frontend`** — structure authority (its Angular-side mirror is `riviera-modulith`); this skill is the styling *how*, that one is the *where*.
- **`angular-developer`** — `references/tailwind-css.md` (v4 setup) points here for repo conventions.
- **`riviera-review-overlay`** — RV-FE-* checks the result at the review gate.
