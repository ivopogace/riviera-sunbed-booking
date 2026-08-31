import { Directive } from '@angular/core';

/**
 * The translucent form-field surface of the Liquid Glass auth card — the input twin of
 * `shared/card-glass.ts`. A directive, not a mixin: Tailwind has no CSS-level sharing primitive, so
 * a surface recipe applied to arbitrary hosts moves to the directive layer (riviera-tailwind rule 1).
 * Apply to any input/select: `<input appFieldGlass class="rounded-[14px] px-[13px] py-[11px]">`.
 *
 * Uses the `--riv-field-*` tokens rather than the design file's white 1px border: an input boundary
 * must clear 3:1 against its surroundings (WCAG 1.4.11), which the darker token already encodes.
 * Carries NO border-radius and NO padding — two competing radius utilities resolve by stylesheet
 * order, not class order, so each consumer sets its own (riviera-tailwind rule 3).
 *
 * `--riv-field-scheme` drives the native chrome (autofill tint, caret, selection): the field is
 * light-styled in porcelain AND riviera (so it must not follow riviera's `color-scheme: dark`),
 * but dark-styled in the dark theme — a per-theme token, not a hardcoded `scheme-light`.
 */
@Directive({
  selector: '[appFieldGlass]',
  host: {
    class:
      '[color-scheme:var(--riv-field-scheme)] bg-riv-field-fill border border-riv-field-border text-riv-card-ink',
  },
})
export class FieldGlass {}
