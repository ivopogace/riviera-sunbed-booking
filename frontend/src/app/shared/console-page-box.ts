import { Directive } from '@angular/core';

/**
 * The console's one page box (#1589): 1120px, the width the header row and the tab rail sit in.
 * Every 1120px in the app lives in this file. The box's content edge is its edge plus the row's
 * `px-6` gutter: where the header's wordmark and the rail's first tab start.
 */
export const CONSOLE_PAGE_ROW = 'mx-auto w-full max-w-[1120px]';

/** {@link CONSOLE_PAGE_ROW} on a full-bleed row in a template; the row supplies its own gutter. */
@Directive({
  selector: '[appConsolePageRow]',
  host: { class: CONSOLE_PAGE_ROW },
})
export class ConsolePageRow {}

/**
 * The box's content edge for a child of `.oc-main`, which stays 1300px wide (`px-6`) so the
 * beach-map grid can fit to width. In a containing block P wide that edge sits
 * max(0, (P − 1120px) / 2 + 1.5rem) in, and a margin percentage resolves against P. The child
 * sets its own `max-w`, left-aligned: the narrow tabs (Pricing, Requests, Payouts, Venue).
 */
@Directive({
  selector: '[appConsolePageColumn]',
  host: { class: 'mr-auto ml-[max(0px,calc((100%_-_1120px)/2_+_1.5rem))]' },
})
export class ConsolePageColumn {}

/** {@link ConsolePageColumn}'s edge at the full width the header's content spans (1120px less both
 *  gutters): the Daily tab, the pending-approval banner. */
@Directive({
  selector: '[appConsolePageBox]',
  host: {
    class:
      'block w-full mr-auto ml-[max(0px,calc((100%_-_1120px)/2_+_1.5rem))] max-w-[calc(1120px_-_3rem)]',
  },
})
export class ConsolePageBox {}
