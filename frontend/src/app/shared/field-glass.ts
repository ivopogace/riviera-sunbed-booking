import { Directive } from '@angular/core';

/**
 * The Liquid Glass auth card's translucent form-field surface, the input twin of
 * `shared/card-glass.ts` (a directive per riviera-tailwind rule 1), for any input/select. The
 * `--riv-field-*` tokens, not a white 1px border, clear WCAG 1.4.11's 3:1. NO radius or padding:
 * competing utilities resolve by stylesheet order, so each consumer sets its own (rule 3).
 * `--riv-field-scheme` sets native chrome per theme: light in porcelain AND riviera (never
 * riviera's `color-scheme: dark`), dark in dark — a token, never a hardcoded `scheme-light`.
 */
@Directive({
  selector: '[appFieldGlass]',
  host: {
    class:
      '[color-scheme:var(--riv-field-scheme)] bg-riv-field-fill border border-riv-field-border text-riv-card-ink',
  },
})
export class FieldGlass {}
