import { Directive } from '@angular/core';

/**
 * The project's 44 × 44 CSS px touch-target floor (WCAG 2.5.5), on a native control:
 * `<button appTouchTarget>`, `<a appTouchTarget>`, `<input appTouchTarget>`. Both axes — a control
 * tall enough but 20 px wide is as unhittable as a short one.
 *
 * <p>It sets no `display`, because a directive utility and a consumer utility for the same property
 * resolve by stylesheet order, not class order. So on an `<a>` still `display: inline` this is a
 * silent no-op — pair it with `inline-flex items-center`. The proof is never the class list;
 * `frontend/e2e/touch-targets.e2e.ts` measures the rendered box. A genuinely exempt control carries
 * `data-touch-exempt="<reason>"` instead. Rationale: `docs/plans/touch-target-floor.md`.
 */
@Directive({
  selector: '[appTouchTarget]',
  host: { class: 'min-h-11 min-w-11' },
})
export class TouchTarget {}
