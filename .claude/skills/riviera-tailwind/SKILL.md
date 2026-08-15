---
name: riviera-tailwind
description: The how-to-write-Tailwind authority for the riviera-sunbed-booking frontend (Tailwind v4, Angular 22). Load BEFORE styling ANYTHING under frontend/src — a new component or HTML template, a restyle, or an SCSS→Tailwind migration — whether or not Tailwind was the plan, because Tailwind IS the plan: it is mandatory for all new styling (a fresh .scss is a review finding; SCSS is being retired). Complements riviera-frontend (which folder a file goes in) and angular-developer (generic Angular+Tailwind technique); RV-FE-* checks the result.
---

# Riviera Tailwind conventions

**Announce at start:** "Loaded riviera-tailwind — applying the project's directive-sharing, no-`@apply`, no-drift Tailwind idioms."

## Why this skill exists

Tailwind v4 is the **go-forward** for styling here; component SCSS is being retired
(precedent: `shared/retry-button.ts`, then the beach-map migration — the `shared/*-glass`
+ `amenity-chip` + `status-chip` + `failure-panel` directives and 8 migrated components). Those
files are worked examples: **read the nearest one before styling**, don't re-derive the pattern.
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
4. **Every interactive control meets a 44 × 44 CSS px floor** (WCAG 2.5.5 / iOS HIG) — set it with
   **`[appTouchTarget]`** (`shared/touch-target.ts`), not by hand-tuning padding per control. Both
   axes: a control tall enough but 20 px wide is as unhittable as a short one. Three things the
   rule's shape depends on, each of which has already caught someone:
   - **`min-height` is a no-op on a `display: inline` box.** On an `<a>`, the directive does nothing
     until you pair it with `inline-flex items-center` — which is why it deliberately sets no
     `display` of its own (rule 3's stylesheet-order problem applies to `display` too).
   - **The proof is the rendered box, never the class list.** `frontend/e2e/touch-targets*.e2e.ts`
     measures `getBoundingClientRect()` on every visible control per surface. A class-based check
     would both miss real failures (the inline case above; a grid tile squeezed by its column) and
     flag correct code — `py-[11px] text-[14px]` in a wrapping flex row measures 64 px.
   - **Exemptions are marked, not assumed:** `data-touch-exempt="<reason>"` on the control or an
     ancestor. Three documented classes — a link inside a sentence (2.5.5's own inline exception),
     anything rendered by a third party in an iframe (the Stripe Payment Element), and a control
     that **renders no box at all** whose visible proxy carries the target (`venue-tab.html`'s
     `<input type="file" class="hidden">`, whose labelled button is the real control). The third
     class is #648's: putting `[appTouchTarget]` on a `display: none` element would declare a floor
     it cannot have, which is the same lie as the inline `<a>` above. Anything else that "can't"
     meet the floor is a layout to fix, not an exemption to write.
   - **A guard checks the declaration while you type** (#648): `scripts/check-touch-target.mjs`
     (`PostToolUse` hook + CI; by hand `--files <path…>`, or `--all`). TT-1/TT-2 gate the
     *declaration* only — a green guard is not a measured box, and `<a>` is out of its scope
     entirely. Full mechanics: `frontend/.claude/CLAUDE.md` + the review overlay's TT items.

   Origin and the app-wide sweep that applied it: `docs/plans/touch-target-floor.md` (#605); the
   first surface to state the floor was the per-set beach-map editor (#600). The static guard and
   the marking pass that made it gateable: `docs/plans/touch-target-guard.md` (#648).
5. **Idiom quick-reference** (match the exemplars, don't reinvent):
   - `text-[14px]`, **not** `text-sm` — named sizes bundle a `line-height` and drift.
   - Arbitrary variants for what utilities/plugins don't cover (no plugins — locked stack):
     `[scrollbar-width:none]`, `[&::-webkit-scrollbar]:hidden`, `[&.premium]:bg-[#…]`.
   - `[transition:background_0.15s_ease,transform_0.12s_ease]` to keep **per-property**
     durations exact (plain `transition` forces one duration + Tailwind's easing ≠ `ease`).
   - `hover:` already compiles under `@media (hover:hover)` in v4; `motion-reduce:` replaces
     the `prefers-reduced-motion` guard.
   - Gradient CSS-var background = `bg-(image:--riv-photo-grad)`; bare `bg-(--x)` is a *color*.
   - `host: { style: '--foo: …' }` for a static custom property that drives layout.

## Styling across the two themes

The app has two themes — `riviera` (dark, white ink) and `porcelain` (light, dark ink).
Theme *ownership* (who writes `data-riv-theme`, the token registry, subtree pinning) is
`riviera-frontend`'s call; this section owns only how a component styles across themes.
Vary by theme in this order of preference:

1. **Tokens do the switching (the norm).** Components consume `--riv-*` tokens
   (`var(--riv-*)`, `bg-(--riv-*)`) and stay **theme-agnostic** — they never name a theme.
   Reach for a token first; add one if none fits (where tokens are declared per theme is
   `riviera-frontend`'s theming section).
2. **`:host-context([data-riv-theme='riviera'])` is the escape hatch.** Only when a whole
   background *treatment* differs — not just a token value — does a component branch on the
   theme. The one precedent is the home-hero **scrim** (`home.scss`): a borderless feathered
   dark wash in riviera, bare in porcelain. It's deliberately the hero **only** — every other
   dark riviera surface keeps the `appPanelGlass` frosted panel, so don't spread the scrim by
   reflex.

**Keep content position identical across themes.** When a surface is treated-in-one-theme /
bare-in-the-other, put the shared padding/layout on the **base** rule and make **only the
background** theme-conditional. Otherwise the same element sits at a different
`getBoundingClientRect().top` per theme. Verify by measuring that anchor in both themes — it
must match. This is *layout* drift; the colour-drift rule below can't see it.

> A theme-conditional, multi-stop, px-anchored gradient behind `:host-context` is one of the
> few things still cleaner as **SCSS** than as Tailwind arbitrary values — the scrim lives in
> `home.scss` on purpose. "SCSS is retiring" is the default, not an absolute; don't mechanically
> port a case like this.

## No visual/colour drift (the hard rule)

Prove no drift by diffing **computed styles** (`getComputedStyle` in Playwright /
`test:e2e:a11y`), not the class list — the `*.contrast.spec.ts` files are pure maths and
can't catch a colour that's wrong-but-still-AA, or a dropped `cursor`/`transition`.

**GOTCHA — border-width snapping:** Chromium's `getComputedStyle` returns the
device-pixel-**snapped used value** for `border-width`, so a `1.5px` border reads `"1px"`.
That is **identical to the old SCSS** `1.5px` (the compiled `border-width:1.5px` is
byte-equal) — assert the snapped value, don't chase it as a regression.

## SCSS→Tailwind migration checklist

**There is no shared SCSS left** (`shared/_glass.scss` retired at #477 with its last recipe,
`status-chip`); what remains is 10 `.scss` files under `frontend/src/app`, 6 of them in
`booking/` (the `home.scss` scrim stays SCSS on purpose — the blockquote above). Migrating
one? Load `references/scss-migration.md` for the four-step checklist (inventory blast radius →
pick scope → retain test hooks + contrast specs → verify).

## Red flags

| Thought | Reality |
|---|---|
| "I'll `@apply` the shared styles." | No `@apply`/`@utility` here. Extract a directive/component. |
| "Drop the `.set-tile` class, it's just styling now." | A spec queries it — keep it as an inert marker. |
| "Bundle `rounded-[26px]` into the glass directive." | Radius resolves by stylesheet order — unbundle it. |
| "`text-sm` is 14px, close enough." | It also sets line-height → drift. Use `text-[14px]`. |
| "border-width is 1px now — I broke it." | Chromium snaps 1.5px→"1px"; the SCSS did too. Not a regression. |
| "Branch the component on `data-riv-theme` for this colour." | Colours switch via `--riv-*` tokens; components stay theme-agnostic. `:host-context` is only for whole-treatment differences. |
| "Same padding, I'll just add the riviera background." | Shared layout on the base rule; theme-conditional *background* only — else content shifts between themes. |
| "Classes look right, ship it." | Diff computed styles; contrast specs can't see drift. |
| "I added `min-h-11`, the target's fixed." | Not on a `display: inline` `<a>` — it's a no-op there. Pair it with `inline-flex items-center` and let the sweep measure it. |
| "This control can't be 44 px, the layout won't allow it." | Then the layout is the bug. `data-touch-exempt` is for inline prose links, third-party iframes and box-less controls, not for tight spots. |
| "`check-touch-target` is green, so the floor holds." | It only proves someone *declared* something. It never measures a box, and it never looks at `<a>`. The sweep is the proof. |
| "`bg-(--riv-photo-grad)` for the gradient." | That's a color. Use `bg-(image:--riv-photo-grad)`. |

## When NOT to use

- Deciding *which folder* a file/primitive goes in → `riviera-frontend`.
- Generic Angular+Tailwind technique (signals, host bindings) → `angular-developer` + `frontend/.claude/CLAUDE.md`.
- Backend/SCSS-only work.

## Integration

- **`riviera-frontend`** — structure authority (its Angular-side mirror is `riviera-modulith`); this skill is the styling *how*, that one is the *where*.
- **`angular-developer`** — see its `references/tailwind-css.md` for generic Tailwind v4 setup; the repo conventions stay here.
- **`riviera-review-overlay`** — RV-FE-* checks the result at the review gate.
