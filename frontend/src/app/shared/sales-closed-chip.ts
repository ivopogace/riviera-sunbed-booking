import { Component } from '@angular/core';

import { SemanticChip } from './semantic-chip';

/**
 * The "Sales closed for today" badge — the platform's claim that online sales for the selected day
 * have closed at this venue, in the semantic-chip skin beside the mode chip on the Discover card's
 * photo band and on the pin preview. The closed-for-season badge outranks it: a call site shows one claim
 * at a time. The host drops out of layout; the box is the band's.
 */
@Component({
  selector: 'app-sales-closed-chip',
  imports: [SemanticChip],
  host: { class: 'contents' },
  template: `<span
    appSemanticChip
    class="sales-closed-chip inline-flex items-center px-[11px] py-[5px] text-[11px] tracking-[0.03em]"
    >Sales closed for today</span
  >`,
})
export class SalesClosedChip {}
