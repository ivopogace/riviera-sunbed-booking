---
name: riviera-tailwind
description: >-
  The how-to-write-Tailwind authority for the riviera-sunbed-booking frontend (Tailwind v4,
  Angular 22). Load BEFORE styling ANYTHING under frontend/src — a new component or HTML
  template, a restyle, or an SCSS→Tailwind migration — whether or not Tailwind was the
  plan: Tailwind is the default, and SCSS needs a stated justification. Complements
  riviera-frontend (which folder a file goes in) and angular-developer (generic
  Angular+Tailwind technique); RV-FE-* checks the result.
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
   component (`retry-button.ts`) or variant directive (`amenity-chip.ts`). When that reused
   element must stay a **native** tag — for its semantics, or so the call site's own skin keeps
   painting on the real box — the component takes an **attribute selector** over that tag
   (`booking/cancellation-terms-note.ts` is `p[appCancellationTermsNote]`), which is what angular.dev's a11y guide
   recommends for augmenting a native element. Two consequences worth knowing before you write
   one. First, `@angular-eslint/component-selector` is configured `type: 'element'` and cannot
   express both forms at once (`style` takes a single value, and the two disagree on case), so an
   attribute component needs a **file-scoped override** running the rule in attribute mode — not
   an inline disable, which would stop checking the selector at all; `eslint.config.js` keeps the
   list, and adding to it is meant to be deliberate. Second, and this is the criterion:

   > **Augment by attribute when the element is a text container; own the element inside the
   > component when its own content carries a11y meaning.**

   `<p>` and `<div>` take the attribute form happily (`p[appAdminForbidden]`,
   `p[appCancellationTermsNote]`, `p[appLegalConsent]`, `div[appLegalFooter]`). An `<a>` or a `<label>` does not: written empty at
   the call site, with its content supplied by the component, it is indistinguishable to
   `elements-content` and `label-has-associated-control` from a genuinely empty link or a label
   with no control — and silencing those per file blinds them to real violations elsewhere in the
   same file. Those primitives take an **element selector with a `class: 'contents'` host** and
   render the native element in their own template, where the linter can see the content and the
   host still drops out of the parent's flex or grid (`app-manage-booking-link`,
   `app-booking-mode-field`, `app-booking-cutoff-field`). The directive's host `class` string is
   scanned by Tailwind, so the utilities generate normally.
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
     `[&.premium]:bg-[#…]`, `[scrollbar-width:none]` — but **scrollbars are first-party since
     v4.3**: `scrollbar-none|thin|auto`, `scrollbar-thumb-*`/`scrollbar-track-*`,
     `scrollbar-gutter-*`. Use those, not the old `[scrollbar-width:none]
     [&::-webkit-scrollbar]:hidden` pair (retired from `beach-map-canvas.html` at #742).
     They set `scrollbar-width` only, so they ask rather than guarantee — Safari paints its
     own bar before 18.2.
   - `[transition:background_0.15s_ease,transform_0.12s_ease]` to keep **per-property**
     durations exact (plain `transition` forces one duration + Tailwind's easing ≠ `ease`).
   - `hover:` already compiles under `@media (hover:hover)` in v4; `motion-reduce:` replaces
     the `prefers-reduced-motion` guard.
   - Gradient CSS-var background = `bg-(image:--riv-photo-grad)`; bare `bg-(--x)` is a *color*.
   - `host: { style: '--foo: …' }` for a static custom property that drives layout.

## Icons — inline SVG, shared as a component

There is **no icon library and no icon registry** here: `MatIconRegistry` is Angular Material
(not in this stack), the angular-cli MCP has no SVG tooling, and angular.dev's v22 index returns
nothing for an icon component. An icon is an inline `<svg>` you write. The repo's one glyph and
its precedent is **`shared/clock-icon.ts`** (the beach-map sales-close note's clock, rendered
directly in `venue/venue-map.html`) — read it before adding a second.

**ICON-1. A shared glyph is a `@Component`, not a directive** — an instance of the general rule
that a directive only adds classes and attributes to an element that already exists, so anything
supplying *markup* (this glyph's `circle`/`path` geometry, a shared note's sentence) is forced onto
rule 1's "reused *element*" branch rather than choosing it. It
will look inconsistent with the `appFailureIcon` / `appAmenityChip` neighbours; it isn't.

**ICON-2. `stroke="currentColor"` (or `stroke-current`) is what lets one copy serve any call
site's ink** — the surrounding note's `color` cascades in and the stroke follows.
This is why a shared glyph needs **no colour input and no variant**.

**ICON-3. Size with presentation attributes, override with a class.** `width="13"` /
`stroke-width="2"` on the element sit below author stylesheets in the cascade, so *any* utility
beats them: the component's attributes are **defaults**, and a call site resizes with a plain
class — no `input()`, no specificity arithmetic.

**ICON-4. Utilities are global here, so the call site can reach into the glyph.**
`src/tailwind.css` loads through `angular.json`'s `styles` array, and emulated encapsulation only
stamps `_ngcontent-*` onto rules compiled from a component's own `styles`/`styleUrls`. So
`[&_svg]:size-[15px]` written on any **ancestor** in the parent template — the override contract
`clock-icon.spec.ts` pins on its host — compiles to a plain `… svg` descendant rule and
matches it, with zero API surface on either component. Two costs
to take with it: **prefer the descendant `[&_svg]` to the child `[&>svg]`** — the child form
silently stops matching the day anyone wraps the root element — and remember this makes the
glyph's internal DOM part of its contract, which nothing in jsdom can see. So **pin the rendered
size in the mocked e2e with `toHaveCSS`** (worked example: `discovery-flow.e2e.ts`). Rule 4's
"the proof is the rendered box, never the class list" applies to glyphs too.

**ICON-5. `class: 'contents'` on the host** (→ `display: contents`) drops the wrapper out of
layout, so the SVG — not the `<app-clock-icon>` element — is what the sentence's flex container
lays out. The note's `gap-1`/`shrink-0` keeps working, so adopting the component
causes no visual diff. The reason is the **wrapper**, not preflight: without `contents` the host
becomes the flex item and the child's `shrink-0` and the parent's `gap` no longer act on the
glyph. (Preflight's `img, svg, … { display: block }` is a separate fact — it is why an svg needs a
flex or inline context to sit beside text at all.) Not a new pattern: `shared/stat-tile.ts`
already hosts on `class: 'contents'` for the same reason.

**ICON-6. `aria-hidden` goes on the host AND the inner `<svg>`.** Redundant but free: the sentence
carries the meaning, specs query the inner one, and a call site that never looks at the SVG is
still covered.

> **Rejected:** the esbuild `import clock from './clock.svg' with { loader: 'text' }` route. It
> inlines the file at build time but then needs `innerHTML` (sanitizer friction), loses per-call-site
> sizing and `class` control, and re-applies `aria-hidden` at the host anyway — a build-config change
> for one glyph. Revisit only if the app grows a real icon set.

## Styling across the themes

The app has three themes — `porcelain` (light, dark ink, the default), `riviera` (branded
dark teal, white ink), and `dark` (neutral slate, white ink, the OS-dark default).
Theme *ownership* (who writes `data-riv-theme`, the token registry, subtree pinning) is
`riviera-frontend`'s call; this section owns only how a component styles across themes.
Vary by theme in this order of preference:

1. **Tokens do the switching (the norm).** Components consume `--riv-*` tokens and stay
   **theme-agnostic** — they never name a theme. The tokens are registered in
   `tailwind.css`'s `@theme inline` block, so a color/font/shadow position uses the
   **named utility** (`text-riv-ink`, `bg-riv-card-glass`, `border-riv-field-border`,
   `font-riv`); only image tokens (gradients/scrims, no theme namespace) keep the
   arbitrary form `bg-(image:--riv-*)`, and a raw `var(--riv-*)` remains right inside a
   composite arbitrary value (a `color-mix(…)` ring, a hand-built gradient). Reach for a
   token first; add one if none fits — mapped in `@theme inline`, and declared per theme
   **unless the value deliberately does not switch** (where tokens are declared per theme
   is `riviera-frontend`'s theming section). The exception is narrow but real, and #835
   shipped both halves of it: a token painted over a surface that itself does not theme
   (`--riv-solid-btn-ink` on the outline-button fill, fixed at `#f4f6f7`) would drift
   light-on-light if it switched, and a tint family that painted one literal in every theme
   before it was tokenised (`--riv-accent-*`) gains a silent restyle the day someone adds a
   dark override. Both are declared once, in the base block, with the reason at the
   declaration — a theme-invariant token is a decision to write down, never an omission. #850
   is the first half again, and the worked example to copy: the form-error banners' fill and ink
   move as a **pair** (`--riv-form-error-fill`/`-ink`), because it is the fill's own fixedness that
   forbids the ink from theming — the themed `--riv-error-ink` over it measures 1.54:1. The unit is
   the whole skin, not one position: a fixed fill pins every ink and border on it
   (`--riv-solid-btn-*`), and the pinning runs in **whichever direction the fixed position sits** —
   at `--riv-solid-fill-*` the fixed ink (`text-white`) is what pins its fills. Group such a family
   by **form, not value**, and reject a coincidental token on its **role** before its value. This is
   Tailwind's own documented multi-theme pattern (docs: Colors § "Referencing other
   variables" — plain vars per `:root`/attribute scope, mapped via `@theme inline`;
   `inline` is what keeps the utility emitting `var(--riv-*)` so per-scope overrides and
   the porcelain subtree pinning still resolve). The `dark:`-variant approach the dark-mode
   docs page shows is deliberately NOT used here — it names a theme in the component,
   which the theme-agnostic rule above forbids, and it cannot express three themes.
2. **`:host-context([data-riv-theme='riviera'])` is the escape hatch.** Only when a whole
   *treatment* differs AND no single property's value can carry it does a component branch
   on the theme. Before reaching for it, check whether one property CAN carry the whole
   treatment as a token — `treatment-off` themes hold `none`, like `--riv-hero-shadow` and
   `--riv-hero-scrim` (the home-hero wash: a feathered dark gradient in riviera,
   `background-image: none` in porcelain and dark, consumed unconditionally as
   `bg-(image:--riv-hero-scrim)`). The scrim was tier 2's long-standing precedent until the
   `@theme` token registry made it tier-1-expressible; today NO in-tree case needs the
   hatch. The scrim stays the hero **only** — every other dark riviera surface keeps the
   `appPanelGlass` frosted panel; don't spread it by reflex.

**Keep content position identical across themes.** When a surface is treated-in-one-theme /
bare-in-the-other, put the shared padding/layout on the **base** rule and make **only the
background** theme-conditional. Otherwise the same element sits at a different
`getBoundingClientRect().top` per theme. Verify by measuring that anchor in both themes — it
must match. This is *layout* drift; the colour-drift rule below can't see it.

> "SCSS is retiring" is the default, not an absolute: SCSS stays legitimate for what Tailwind
> can't express cleanly, with the justification stated. The long-standing worked example — the
> `home.scss` hero scrim, kept at #679 because a theme-conditional px-anchored gradient behind
> `:host-context` beat Tailwind *arbitrary values* — retired when the `@theme` token registry
> opened a third option neither #679 alternative covered: the gradient as a per-theme token
> (`--riv-hero-scrim`), consumed unconditionally. A holdout's justification is only as durable
> as the alternatives it weighed; re-check one when the styling substrate shifts.

## No visual/colour drift (the hard rule)

Prove no drift by diffing **computed styles** (`getComputedStyle` in Playwright /
`test:e2e:a11y`), not the class list — the `*.contrast.spec.ts` files are pure maths and
can't catch a colour that's wrong-but-still-AA, or a dropped `cursor`/`transition`.

**GOTCHA — border-width snapping:** Chromium's `getComputedStyle` returns the
device-pixel-**snapped used value** for `border-width`, so a `1.5px` border reads `"1px"`.
That is **identical to the old SCSS** `1.5px` (the compiled `border-width:1.5px` is
byte-equal) — assert the snapped value, don't chase it as a regression.

## SCSS→Tailwind migration checklist

**There is NO SCSS left anywhere under `frontend/src`** (`shared/_glass.scss` retired at
#477 with its last recipe, `status-chip`; the operator-console shell chrome migrated at
#698, the app shell and the booking pay/confirmation/my-bookings trio at #739, the last
component SCSS at #780, then the global `styles.scss` token sheet folded into
`tailwind.css`'s `@theme` layer and the final holdout — the `home.scss` scrim — became the
`--riv-hero-scrim` token, per the blockquote above). A NEW justified holdout may still be
written — the rule survives its example — but it needs its stated why.

**Migrate on touch — the retirement mechanism.** A slice that touches a component still
carrying legacy component SCSS (any of its `.ts`/`.html`/`.scss`) migrates that component's
styling to Tailwind **in the same slice** — narrow scope is fine (the checklist's step 2),
and a justified holdout stays SCSS with its why (none exist in-tree today — the scrim was
the last). **Deferral is never
self-granted:** if migrating would genuinely swamp the slice (a one-line bug fix in a
heavy-SCSS component), ask the maintainer via `AskUserQuestion` — *migrate now, or defer?*
An approved defer means the slice ships just its own fix (the SCSS edit included), the
review gate still runs, merge proceeds, and the migration gets a **follow-up issue** so it
isn't lost. RV-FE-7 checks touched-but-unmigrated SCSS either way. Load
`references/scss-migration.md` for the four-step checklist (inventory blast radius → pick
scope → retain test hooks + contrast specs → verify).

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
