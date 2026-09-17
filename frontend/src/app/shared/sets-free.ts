import { Component, input } from '@angular/core';

/**
 * The sets-free count as the Discover surfaces say it — `18 of 24 free`, the count in the card
 * ink — rendered by the list card's footer and the pin preview alike, so the two cannot drift.
 * A venue with no sets counts `0 of 0 free` beside its `No sets yet` price, on both.
 *
 * <p>Hosts on `class: 'contents'` and carries no size or colour of its own beyond the bold count:
 * each call site wraps it in a span wearing that surface's text size and the soft ink.
 */
@Component({
  selector: 'app-sets-free',
  host: { class: 'contents' },
  template: `<strong class="text-riv-card-ink">{{ free() }}</strong> of {{ total() }} free`,
})
export class SetsFree {
  readonly free = input.required<number>();
  readonly total = input.required<number>();
}
