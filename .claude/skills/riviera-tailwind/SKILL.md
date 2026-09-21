---
name: riviera-tailwind
description: >-
  How to write Tailwind v4 in frontend/: directive sharing (no @apply), test-hook classes,
  the touch-target floor, tokens across the three themes, no-drift proofs. Load BEFORE
  styling anything under frontend/src — Tailwind is the default and SCSS needs a stated
  justification.
---

# Riviera Tailwind conventions

Worked examples: `shared/*-glass`, `amenity-chip`, `status-chip`, `failure-panel`,
`retry-button`. Read the nearest one before styling. Rule numbers are cited from source —
never renumber.

## Rules

1. **Share at the directive/component layer — never `@apply` or `@utility`.** A reused
   surface is an attribute directive (`shared/card-glass.ts`, `panel-glass.ts`); a reused
   element is a component (`retry-button.ts`) or variant directive (`amenity-chip.ts`). A
   reused element that must stay a native tag takes an attribute selector
   (`p[appCancellationTermsNote]`), which needs a file-scoped `eslint.config.js` override for
   `@angular-eslint/component-selector` in attribute mode — not an inline disable. `<p>`/`<div>`
   take the attribute form; `<a>`/`<label>` do not (an empty call site trips
   `elements-content`/`label-has-associated-control`) — those take an element selector with a
   `class: 'contents'` host and render the native element themselves
   (`app-manage-booking-link`, `app-booking-mode-field`, `app-legal-menu-rows`).
2. **Keep a class a spec queries as an inert marker** (`.set-tile.premium`, `.amenity-chip`,
   `.failure-title`) beside the utilities.
3. **Surface directives carry no `border-radius` or padding.** Two competing utilities resolve
   by stylesheet order, not `class` order. Bundle only a property the surface is *defined* by
   and consumers never vary (`shared/photo-scrim.ts`'s `absolute inset-0`); state that at the
   directive.
4. **Every interactive control meets 44 × 44 CSS px** (WCAG 2.5.5) via `[appTouchTarget]`
   (`shared/touch-target.ts`), both axes. It sets no `display`, so on an `<a>` pair it with
   `inline-flex items-center`. Proof is the rendered box:
   `frontend/e2e/touch-targets*.e2e.ts` measures `getBoundingClientRect()`. Exemptions are
   `data-touch-exempt="<reason>"` on the control or an ancestor, four classes only: an inline
   link in a sentence; third-party iframe content (Stripe Payment Element); a box-less control
   whose visible proxy carries the target (`venue-tab.html`'s hidden file input); a control the
   **maintainer** explicitly held to WCAG 2.5.8's 24 px (the ALTCHA checkbox) — never
   self-granted; first try holding the box at the floor and painting smaller over it. Anything
   else is a layout to fix. `scripts/check-touch-target.mjs` (hook + CI; `--files`/`--all`)
   gates the declaration only and ignores `<a>`.
5. **Idioms:** `text-[14px]` not `text-sm` (named sizes bundle line-height); arbitrary variants
   (`[&.active]:bg-riv-accent-chip-fill`), no plugins; first-party `scrollbar-none|thin|auto`,
   `scrollbar-thumb-*`, `scrollbar-gutter-*` (Safari paints its own bar before 18.2);
   `[transition:background_0.15s_ease,transform_0.12s_ease]` for per-property durations;
   `hover:` is already under `@media (hover:hover)`; `motion-reduce:` for reduced motion;
   `bg-(image:--riv-photo-grad)` for a gradient var (`bg-(--x)` is a colour);
   `host: { style: '--foo: …' }` for a static custom property.
6. **One focus baseline, never turned off.** `button:focus-visible` gets the 3px
   `--riv-accent-ink` ring from `@layer base` in `src/tailwind.css`; a button adds
   `focus-visible:` utilities only for colour (`outline-white` on fixed dark, `outline-current`
   on the fixed-white sign-out bar) or offset (inset inside `overflow-hidden`, or an
   edge-to-edge bar slot: `shared/tab-rail.ts`'s `EDGE_SLOT_RING`). Never `outline-none`,
   `outline-hidden`, `outline-0`, `[outline:none]` — `app/shared/focus-ring-baseline.spec.ts`
   fails the build. The base rule reaches `<button>` only; a row skin an `<a>` wears carries
   the ring explicitly (`shared/popover-skin.ts`'s `POP_ROW_RING`).

## Icons — inline SVG components

No icon library or registry. Precedents: `shared/clock-icon.ts` (one glyph),
`shared/console-glyphs.ts` (a set picked by `NgComponentOutlet`).

- ICON-1 a shared glyph is a `@Component` (it supplies markup), not a directive.
- ICON-2 `stroke="currentColor"`; no colour input, no variant (no `name` input).
- ICON-3 size with presentation attributes (`width="13"`, `stroke-width="2"`); a call site
  overrides with a class, no `input()`.
- ICON-4 utilities are global, so `[&_svg]:size-[15px]` on a parent-template ancestor reaches
  in (prefer descendant `[&_svg]` to child `[&>svg]`); pin the rendered size in the mocked e2e
  with `toHaveCSS` — jsdom can't see it.
- ICON-5 `class: 'contents'` on the host so the SVG, not the wrapper, is laid out.
- ICON-6 `aria-hidden` on the host AND the inner `<svg>`.

Not the esbuild `with { loader: 'text' }` import (needs `innerHTML`, loses sizing control). A
shared `<svg …>` attribute block interpolated into templates breaks angular-eslint's parser —
each glyph writes its attributes out.

## Styling across the themes

Three themes: `porcelain` (light, dark ink, default), `riviera` (dark teal, white ink), `dark`
(slate, white ink, OS-dark). Ownership (who writes `data-riv-theme`, the registry, subtree
pinning) is `riviera-frontend`'s.

1. **Tokens do the switching.** Components consume `--riv-*` and never name a theme. Use the
   `@theme inline` utilities (`text-riv-ink`, `bg-riv-card-glass`, `border-riv-field-border`,
   `font-riv`); image tokens keep `bg-(image:--riv-*)`; raw `var(--riv-*)` only inside a
   composite arbitrary value. Add a token if none fits — mapped in `@theme inline`, declared
   per theme unless it deliberately does not switch (a token painted over a non-theming
   surface like `--riv-solid-btn-ink`; a tint family like `--riv-accent-*`), with the reason at
   the base-block declaration.
   - Console-only tokens (`--riv-console-*`, `--riv-select-*`, `--riv-alert-tint`, …) declare in
     the base block AND `dark`, never `riviera`; a guard holds them to those two. A one-theme
     treatment takes a treatment-off token (`--riv-console-avatar-ring`: `transparent` in
     porcelain). The console paints no `white`/`black` utilities beyond the sweep's
     fixed-surface residue (`text-white`/`outline-white` on a fixed fill, the camera's
     `bg-black/80`); inset fills are `bg-riv-console-inset/α`
     (`operator/console-literal-sweep.spec.ts`).
   - Tokenise a skin whole: a fixed fill pins every ink and border on it
     (`--riv-form-error-fill`/`-ink`, the `--riv-solid-btn-*` set); take a per-state class
     ternary whole. Group a family by form, not value.
   - The `dark:` variant is NOT used: it names a theme and cannot express three.
2. **`:host-context([data-riv-theme='riviera'])`** only when a whole *treatment* differs AND no
   single property can carry it as a token. Check first whether a treatment-off token works
   (`--riv-hero-scrim`: a gradient in riviera, `none` elsewhere). No in-tree case needs the
   hatch; the scrim stays the hero only.

**Content position identical across themes:** shared padding/layout on the base rule, only the
background theme-conditional; verify `getBoundingClientRect().top` in both.

SCSS only for what Tailwind can't express, with the why stated.

## No drift (the hard rule)

Prove a restyle with a `getComputedStyle` diff in Playwright (`test:e2e:a11y`), not the class
list — contrast specs are pure maths. Chromium snaps `1.5px` borders to `"1px"`; assert the
snapped value. A new shared primitive gets a `.spec.ts`; a composited or tinted surface gets a
`*.contrast.spec.ts` proving AA over its worst-case gradient stops with the
`testing/glass-tokens.ts` helpers.
