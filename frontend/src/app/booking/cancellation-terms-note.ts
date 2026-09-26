import { Component, computed, input } from '@angular/core';

import { formatDeadline } from '../shared/deadline';
import { CancellationTerms } from './booking.model';

/**
 * This booking's actual cancellation terms, as the tourist reads them before committing.
 * **Display only: the server computed the terms** (invariant #10) — nothing here decides anything.
 * One sentence per window: FREE names the Tirane-rendered deadline; LATE the venue's partial share
 * (or no refund at 0 bps); CLOSED the non-refundable last-minute booking.
 *
 * <p>Attribute selector on the native `<p>`: paragraph semantics survive; type scale and colour
 * are the call site's. Renders once terms resolve; the caller's `role="status"` announces them.
 */
@Component({
  selector: 'p[appCancellationTermsNote]',
  host: {
    class: 'block leading-[1.5]',
    'data-testid': 'cancellation-terms-note',
  },
  template: `{{ sentence() }}`,
})
export class CancellationTermsNote {
  readonly terms = input.required<CancellationTerms>();

  protected readonly sentence = computed(() => {
    const t = this.terms();
    switch (t.window) {
      case 'FREE':
        return `Free cancellation until ${formatDeadline(t.freeCancellationEndsAt)}.`;
      case 'LATE':
        return t.lateCancelRefundBps > 0
          ? `Past free cancellation — cancelling refunds only ${t.lateCancelRefundBps / 100}% of the price.`
          : 'Past free cancellation — no refund if cancelled.';
      case 'CLOSED':
        return 'Non-refundable last-minute booking — it can’t be cancelled once paid.';
    }
  });
}
