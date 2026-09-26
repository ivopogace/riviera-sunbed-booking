import { Directive } from '@angular/core';

/**
 * The 44 × 44 CSS px touch-target floor (WCAG 2.5.5), both axes, on a native button, link or input.
 *
 * It sets no `display` (a directive and a consumer utility for one property resolve by stylesheet
 * order), so on a still-inline `<a>` it is a silent no-op: pair it with `inline-flex items-center`.
 * The proof is never the class list; `frontend/e2e/touch-targets.e2e.ts` measures the rendered box.
 * A genuinely exempt control carries `data-touch-exempt="<reason>"` instead.
 * Rationale: `riviera-tailwind`, the touch-target floor.
 */
@Directive({
  selector: '[appTouchTarget]',
  host: { class: 'min-h-11 min-w-11' },
})
export class TouchTarget {}
