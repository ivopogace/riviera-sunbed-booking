import { Directive } from '@angular/core';

/**
 * The primary CTA skin: the `--riv-cta-border` hairline on the `--riv-cta-grad` fill, white ink, the
 * inset highlight and the hover lift. Carries no radius, padding, type or drop shadow (`riviera-tailwind`
 * rule 3); the highlight is an `inset-shadow-*` so it composes with a call site's `shadow-*`.
 * The hover skips a disabled or `aria-disabled` control. Contrast proof:
 * `cta-border-token.contrast.spec.ts`; no-drift proof: `e2e/primary-cta-skin.e2e.ts`.
 */
@Directive({
  selector: 'button[appPrimaryCta], a[appPrimaryCta]',
  host: {
    class:
      'border border-riv-cta-border bg-(image:--riv-cta-grad) text-white inset-shadow-[0_1px_0_rgba(255,255,255,0.5)] hover:not-disabled:not-aria-disabled:brightness-[1.06]',
  },
})
export class PrimaryCta {}
