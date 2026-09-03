---
name: riviera-tailwind
description: >-
  How to write Tailwind v4 in frontend/: directive sharing (no @apply), test-hook classes,
  the touch-target floor, tokens across the three themes, no-drift proofs,
  migrate-on-touch. Load BEFORE styling anything under frontend/src — Tailwind is the
  default and SCSS needs a stated justification.
---

# Riviera Tailwind conventions

Tailwind v4 is the go-forward for styling; component SCSS is retired. The `shared/*-glass`,
`amenity-chip`, `status-chip`, `failure-panel`, `retry-button` files are the worked
examples: read the nearest one before styling, don't re-derive the pattern. This skill
states the decisions and traps the code can't show you.

## The rules

1. **Share at the component/directive layer — never `@apply` or `@utility`.** Tailwind has
   no mixin; this repo does not fake one in CSS. A reused *surface* is an attribute
   directive (`shared/card-glass.ts`, `panel-glass.ts`); a reused *element* is a component
   (`retry-button.ts`) or variant directive (`amenity-chip.ts`). When that reused element
   must stay a native tag (for its semantics, or so the call site's own skin keeps painting
   on the real box), the component takes an attribute selector over that tag
   (`booking/cancellation-terms-note.ts` is `p[appCancellationTermsNote]`). Two consequences:
   - `@angular-eslint/component-selector` is configured `type: 'element'` and cannot express
     both forms at once, so an attribute component needs a file-scoped override in
     `eslint.config.js` running the rule in attribute mode — not an inline disable.
   - **Augment by attribute when the element is a text container; own the element inside
     the component when its own content carries a11y meaning.** `<p>` and `<div>` take the
     attribute form (`p[appAdminForbidden]`, `p[appCancellationTermsNote]`,
     `p[appLegalConsent]`, `div[appLegalFooter]`). An `<a>` or a `<label>` does not: written
     empty at the call site with content supplied by the component, it is indistinguishable
     to `elements-content` and `label-has-associated-control` from a genuinely empty link or
     label, and silencing those per file blinds them elsewhere in the same file. Those
     primitives take an element selector with a `class: 'contents'` host and render the
     native element in their own template (`app-manage-booking-link`,
     `app-booking-mode-field`, `app-booking-cutoff-field`). The host `class` string is
     scanned by Tailwind, so the utilities generate normally.
2. **Keep the old semantic class as an inert marker when a test queries it.** Specs query
   `.set-tile.premium`, `.amenity-chip`, `.failure-title`, etc. Retain those class names on
   the element or the directive host; the utilities do the styling beside them.
3. **Surface directives carry no `border-radius`** (and no padding). Tailwind resolves two
   competing `border-radius` utilities by stylesheet order, not `class` order, so a
   directive `rounded-[26px]` + a consumer `rounded-full` is a coin-flip. Each consumer
   sets its own radius.
4. **Every interactive control meets a 44 × 44 CSS px floor** (WCAG 2.5.5) — set it with
   `[appTouchTarget]` (`shared/touch-target.ts`), not by hand-tuning padding. Both axes.
   - `min-height` is a no-op on a `display: inline` box. On an `<a>`, the directive does
     nothing until paired with `inline-flex items-center` — which is why it sets no
     `display` of its own (rule 3's stylesheet-order problem applies to `display` too).
   - The proof is the rendered box, never the class list. `frontend/e2e/touch-targets*.e2e.ts`
     measures `getBoundingClientRect()` on every visible control per surface. A class-based
     check would miss the inline case and a grid tile squeezed by its column, and flag
     correct code (`py-[11px] text-[14px]` in a wrapping flex row measures 64 px).
   - Exemptions are marked, not assumed: `data-touch-exempt="<reason>"` on the control or
     an ancestor. Four documented classes — a link inside a sentence (2.5.5's inline
     exception), anything rendered by a third party in an iframe (the Stripe Payment
     Element), a control that renders no box at all whose visible proxy carries the
     target (`venue-tab.html`'s `<input type="file" class="hidden">`, whose labelled button
     is the real control; putting `[appTouchTarget]` on a `display: none` element would
     declare a floor it cannot have), and a control the **maintainer has explicitly held to
     WCAG 2.5.8's AA 24 px minimum** instead of this AAA floor (the ALTCHA checkbox, #920:
     `--altcha-checkbox-size` drives the widget's paint and hit box from one value, so 44 px
     bought the target by inflating the graphic). Anything else that "can't" meet the floor
     is a layout to fix.
   - **The fourth class is a decision, never a workaround.** It is the maintainer's to make,
     per control, recorded in the `data-touch-exempt` reason and the component's TSDoc; it
     costs 2.5.5 conformance on that control and leaves 2.5.8 met with zero headroom, so an
     e2e assertion pins the chosen size (the sweep skips an exempt control, so nothing else
     would). "The design looks better small" is not this class — reach for it only after the
     paint/target split is ruled out, which is what makes it rare.
   - The guard `scripts/check-touch-target.mjs` (`PostToolUse` hook + CI; by hand `--files
     <path…>` or `--all`) gates the *declaration* only (TT-1/TT-2) — a green guard is not a
     measured box, and `<a>` is out of its scope. Slices: #605 (the floor), #648 (the guard).
5. **Idiom quick-reference** (match the exemplars):
   - `text-[14px]`, not `text-sm` — named sizes bundle a `line-height` and drift.
   - Arbitrary variants for what utilities don't cover (no plugins — locked stack):
     `[&.premium]:bg-[#…]`. Scrollbars are first-party since v4.3: `scrollbar-none|thin|auto`,
     `scrollbar-thumb-*`/`scrollbar-track-*`, `scrollbar-gutter-*` — use those, not the old
     `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` pair. They set
     `scrollbar-width` only, so Safari paints its own bar before 18.2.
   - `[transition:background_0.15s_ease,transform_0.12s_ease]` to keep per-property
     durations exact (plain `transition` forces one duration + Tailwind's easing ≠ `ease`).
   - `hover:` already compiles under `@media (hover:hover)` in v4; `motion-reduce:` replaces
     the `prefers-reduced-motion` guard.
   - Gradient CSS-var background = `bg-(image:--riv-photo-grad)`; bare `bg-(--x)` is a *color*.
   - `host: { style: '--foo: …' }` for a static custom property that drives layout.
6. **The focus indicator has one baseline, and no control turns it off.** Every
   `button:focus-visible` gets the 3px `--riv-accent-ink` ring from the `@layer base` rule in
   `src/tailwind.css`, so a button carries `focus-visible:` utilities only to change the
   colour (a host that does not theme: `outline-white` on fixed dark, `outline-current` on the
   fixed-white sign-out bar) or the offset (an inset ring inside an `overflow-hidden` clip).
   Never `outline-none`, `outline-hidden`, `outline-0` or `[outline:none]` on a control —
   `app/shared/focus-ring-baseline.spec.ts` fails the build naming the path. Keep the rule
   inside `@layer base`. Rationale: issue #890.

## Icons — inline SVG, shared as a component

There is no icon library and no icon registry (`MatIconRegistry` is Angular Material, not
in this stack). An icon is an inline `<svg>` you write. The precedent is
`shared/clock-icon.ts` (rendered in `venue/venue-map.html`) — read it before adding a second.

- **ICON-1. A shared glyph is a `@Component`, not a directive** — a directive only adds
  classes and attributes to an element that already exists; anything supplying markup
  (geometry, a sentence) is rule 1's "reused element" branch.
- **ICON-2. `stroke="currentColor"` (or `stroke-current`)** lets one copy serve any call
  site's ink — the surrounding `color` cascades in. A shared glyph needs no colour input
  and no variant.
- **ICON-3. Size with presentation attributes, override with a class.** `width="13"` /
  `stroke-width="2"` on the element sit below author stylesheets in the cascade, so any
  utility beats them: the component's attributes are defaults, and a call site resizes with
  a plain class — no `input()`.
- **ICON-4. Utilities are global, so the call site can reach into the glyph.**
  `src/tailwind.css` loads through `angular.json`'s `styles` array, and emulated
  encapsulation only stamps `_ngcontent-*` onto rules compiled from a component's own
  `styles`/`styleUrls`. So `[&_svg]:size-[15px]` on any ancestor in the parent template
  (the override contract `clock-icon.spec.ts` pins) compiles to a plain descendant rule.
  Prefer the descendant `[&_svg]` to the child `[&>svg]` (the child form stops matching
  the day anyone wraps the root element), and pin the rendered size in the mocked e2e with
  `toHaveCSS` (`discovery-flow.e2e.ts`) — jsdom cannot see the glyph's internal DOM.
- **ICON-5. `class: 'contents'` on the host** (`display: contents`) drops the wrapper out
  of layout, so the SVG — not the `<app-clock-icon>` element — is what the sentence's flex
  container lays out; the note's `gap-1`/`shrink-0` keeps working. Same reason
  `shared/stat-tile.ts` hosts on `class: 'contents'`.
- **ICON-6. `aria-hidden` goes on the host AND the inner `<svg>`.** Redundant but free:
  specs query the inner one, and a call site that never looks at the SVG is still covered.

Rejected: the esbuild `import clock from './clock.svg' with { loader: 'text' }` route — it
needs `innerHTML` (sanitizer friction), loses per-call-site sizing and `class` control, and
re-applies `aria-hidden` at the host anyway. Revisit only if the app grows a real icon set.

## Styling across the themes

Three themes — `porcelain` (light, dark ink, the default), `riviera` (branded dark teal,
white ink), `dark` (neutral slate, white ink, the OS-dark default). Theme ownership (who
writes `data-riv-theme`, the token registry, subtree pinning) is `riviera-frontend`'s; this
section owns how a component styles across themes. In order of preference:

1. **Tokens do the switching (the norm).** Components consume `--riv-*` tokens and stay
   theme-agnostic — they never name a theme. The tokens are registered in `tailwind.css`'s
   `@theme inline` block, so a color/font/shadow position uses the named utility
   (`text-riv-ink`, `bg-riv-card-glass`, `border-riv-field-border`, `font-riv`); only image
   tokens (gradients/scrims) keep the arbitrary form `bg-(image:--riv-*)`, and a raw
   `var(--riv-*)` remains right inside a composite arbitrary value (a `color-mix(…)` ring, a
   hand-built gradient). Reach for a token first; add one if none fits — mapped in `@theme
   inline`, declared per theme unless the value deliberately does not switch. The
   theme-invariant cases, each declared once in the base block with the reason at the
   declaration:
   - a token painted over a surface that itself does not theme (`--riv-solid-btn-ink` on
     the outline-button fill, fixed at `#f4f6f7`) would drift light-on-light if it switched;
   - a tint family that painted one literal in every theme before it was tokenised
     (`--riv-accent-*`) gains a silent restyle the day someone adds a dark override;
   - a token whose whole population sits in a theme-pinned subtree
     (`--riv-console-accent-ink`, under the console's porcelain host) has an unreachable
     dark branch, so a dark value is an unverifiable claim.
   The unit is the whole skin, not one position: a fixed fill pins every ink and border on
   it (the form-error banners' `--riv-form-error-fill`/`-ink` move as a pair; the
   `--riv-solid-btn-*` set), and the pinning runs in whichever direction the fixed position
   sits (at `--riv-solid-fill-*` the fixed ink `text-white` pins its fills). Group such a
   family by form, not value; reject a coincidental token on its role before its value; and
   take a per-state class ternary whole — tokenising one branch leaves a named utility
   beside a hex literal in one expression. This is Tailwind's documented multi-theme
   pattern (plain vars per `:root`/attribute scope, mapped via `@theme inline` — `inline`
   is what keeps the utility emitting `var(--riv-*)` so per-scope overrides and the
   porcelain subtree pinning still resolve). The `dark:`-variant approach is deliberately
   NOT used: it names a theme in the component and cannot express three themes.
2. **`:host-context([data-riv-theme='riviera'])` is the escape hatch.** Only when a whole
   *treatment* differs AND no single property's value can carry it. Before reaching for it,
   check whether one property CAN carry the whole treatment as a token — `treatment-off`
   themes hold `none`, like `--riv-hero-shadow` and `--riv-hero-scrim` (the home-hero wash:
   a feathered dark gradient in riviera, `background-image: none` in porcelain and dark,
   consumed unconditionally as `bg-(image:--riv-hero-scrim)`). No in-tree case needs the
   hatch today. The scrim stays the hero only — every other dark riviera surface keeps the
   `appPanelGlass` frosted panel.

**Keep content position identical across themes.** When a surface is treated-in-one-theme
/ bare-in-the-other, put the shared padding/layout on the base rule and make only the
background theme-conditional; otherwise the same element sits at a different
`getBoundingClientRect().top` per theme. Verify by measuring that anchor in both themes.

SCSS stays legitimate for what Tailwind can't express cleanly, with the justification
stated; a holdout's justification is only as durable as the alternatives it weighed —
re-check one when the styling substrate shifts (the last holdout, the `home.scss` scrim,
retired once the `@theme` token registry made it a per-theme token).

## No visual/colour drift (the hard rule)

Prove no drift by diffing computed styles (`getComputedStyle` in Playwright /
`test:e2e:a11y`), not the class list — the `*.contrast.spec.ts` files are pure maths and
can't catch a colour that's wrong-but-still-AA, or a dropped `cursor`/`transition`.

**Border-width snapping:** Chromium's `getComputedStyle` returns the device-pixel-snapped
used value for `border-width`, so a `1.5px` border reads `"1px"` — identical to the old
SCSS. Assert the snapped value.

## SCSS→Tailwind migration

There is no SCSS left under `frontend/src`. A new justified holdout may still be written,
with its stated why.

**Migrate on touch.** A slice that touches a component still carrying legacy component
SCSS (any of its `.ts`/`.html`/`.scss`) migrates that component's styling to Tailwind in
the same slice — narrow scope is fine — and a justified holdout stays SCSS with its why.
Deferral is never self-granted: if migrating would swamp the slice (a one-line bug fix in a
heavy-SCSS component), ask the maintainer via `AskUserQuestion` — *migrate now, or defer?*
An approved defer means the slice ships just its own fix, the review gate still runs, and
the migration gets a follow-up issue. RV-FE-7 checks touched-but-unmigrated SCSS either
way. Checklist: `references/scss-migration.md`.

## Red flags

| Thought | Reality |
|---|---|
| "I'll `@apply` the shared styles." | No `@apply`/`@utility` here. Extract a directive/component. |
| "Drop the `.set-tile` class, it's just styling now." | A spec queries it — keep it as an inert marker. |
| "Bundle `rounded-[26px]` into the glass directive." | Radius resolves by stylesheet order — unbundle it. |
| "`text-sm` is 14px, close enough." | It also sets line-height → drift. Use `text-[14px]`. |
| "border-width is 1px now — I broke it." | Chromium snaps 1.5px→"1px"; the SCSS did too. |
| "Branch the component on `data-riv-theme` for this colour." | Colours switch via `--riv-*` tokens; components stay theme-agnostic. `:host-context` is only for whole-treatment differences. |
| "Same padding, I'll just add the riviera background." | Shared layout on the base rule; theme-conditional *background* only — else content shifts between themes. |
| "Classes look right, ship it." | Diff computed styles; contrast specs can't see drift. |
| "I added `min-h-11`, the target's fixed." | Not on a `display: inline` `<a>` — pair it with `inline-flex items-center` and let the sweep measure it. |
| "This control can't be 44 px, the layout won't allow it." | Then the layout is the bug. `data-touch-exempt` is for inline prose links, third-party iframes and box-less controls. |
| "`check-touch-target` is green, so the floor holds." | It only proves someone declared something. It never measures a box, and never looks at `<a>`. |
| "`bg-(--riv-photo-grad)` for the gradient." | That's a color. Use `bg-(image:--riv-photo-grad)`. |
| "`outline-none`, I'll draw my own focus state." | The baseline ring is the only indicator many buttons have; the guard fails on a control. Override its colour or offset with `focus-visible:` utilities instead. |

## When NOT to use

- Deciding which folder a file/primitive goes in → `riviera-frontend`.
- Generic Angular+Tailwind technique (signals, host bindings) → `angular-developer` (its
  `references/tailwind-css.md`) + `frontend/.claude/CLAUDE.md`.
- Backend work.
