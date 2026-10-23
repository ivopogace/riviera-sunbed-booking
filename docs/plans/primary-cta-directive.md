# Plan: primary CTA skin as a directive (#1542)

Branch: `feature/1542-primary-cta-directive`. Area: frontend styling only; no invariant touched.

## Goal

One `[appPrimaryCta]` attribute directive (`shared/primary-cta.ts`) carries the primary CTA skin:
`border border-riv-cta-border`, `bg-(image:--riv-cta-grad)`, `text-white`, the inset highlight and
the hover lift. No radius, padding, type or drop shadow (`riviera-tailwind` rule 3). Every non-spec
call site wears it; the contrast specs point at it.

## Acceptance criteria

1. Given the directive on a `<button>` or `<a>`, when rendered, then the host carries the skin
   utilities beside the call site's own (`[class]` binding included) — `primary-cta.spec.ts`.
2. Given every `[appPrimaryCta]` site rendered (tourist submit, projected link, operator button),
   then border width/colour, fill, ink and the inset highlight compute identically and the site's
   own drop shadow survives beside the highlight — `e2e/primary-cta-skin.e2e.ts`.
3. Given a disabled CTA, when hovered, then no brightness filter; enabled, `brightness(1.06)` —
   same e2e.
4. Given any non-spec source under `src/app` other than the directive, then none paints
   `bg-(image:--riv-cta-grad)` — `cta-border-token.contrast.spec.ts`; the directive's host class
   carries the proven hairline and fill — same spec.
5. The calendar's Apply is pinned to the proof by wearing `appPrimaryCta` —
   `availability-calendar.contrast.spec.ts`.

## Risks

- Two `box-shadow` utilities fight by stylesheet order: the highlight is `inset-shadow-*`
  (`--tw-inset-shadow`), the call site's drop shadow `shadow-*` (`--tw-shadow`); Tailwind composes
  both into one `box-shadow`. AC 2 proves it.
- Sibling PRs #1586/#1589/#1551 edit the same operator templates: merge `origin/main`, keep both
  sides, the directive on whichever button survives.

## Behaviour-parity ledger

| Surface | Before | After | Why |
|---|---|---|---|
| Tourist/auth/booking CTAs (full skin) | hand-copied skin | same computed skin via directive | preserved |
| Operator CTAs (`set-editor` ×3, `venue-create-card`, `layout-editor` save, `venue-tab`, `daily-view-tab` link), `admin-operators` | fill + ink only, no hairline/highlight/hover | gain the hairline, highlight and hover; box 2px larger per axis | changed: owner's call to migrate every site; the hairline is the dark-theme 1.4.11 boundary carrier per `cta-border-token.contrast.spec.ts` |
| `layout-editor` Generate button | `hover:brightness-105`, also while busy | `brightness(1.06)`, not while busy | changed: one hover value |
| Disabled / `aria-disabled` CTAs | `hover:brightness-[1.06]` brightened some busy (`aria-disabled`) buttons | no lift while disabled or busy | changed: the skin's hover skips inactive controls |
| `retry-button` focus | focus shadow replaced the inset highlight | highlight stays under the focus shadow | changed: shadows now compose |
| Focus rings, transitions, radius, padding, type, drop shadows | per call site | per call site | preserved |
| Clicks, routes, busy/disabled logic | — | — | preserved: no behaviour change |

## Execution status

- [x] Directive + unit spec
- [x] Call sites migrated, contrast specs re-pointed, token prose de-counted
- [x] No-drift e2e
- [ ] PR open, merged `origin/main`, review, Sonar
