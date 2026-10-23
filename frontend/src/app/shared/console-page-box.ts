import { Directive } from '@angular/core';

/**
 * The console's one 1120px page box (#1589), the header row's and tab rail's; every 1120px utility
 * is here (`operator-venue-switch.ts`'s popover `536px` derives from it by hand). Its content edge
 * is the box's plus the row's `px-6`: where the wordmark and the rail's first tab start.
 */
export const CONSOLE_PAGE_ROW = 'mx-auto w-full max-w-[1120px]';

/** {@link CONSOLE_PAGE_ROW} on a full-bleed row in a template; the row supplies its own gutter. */
@Directive({
  selector: '[appConsolePageRow]',
  host: { class: CONSOLE_PAGE_ROW },
})
export class ConsolePageRow {}

const CONTENT_EDGE = 'mr-auto ml-[max(0px,calc((100%_-_1120px)/2_+_1.5rem))]';

/**
 * The box's content edge for a child of `.oc-main`, which stays 1300px wide (`px-6`) so the
 * beach-map grid can fit to width. In a containing block P wide that edge sits
 * max(0, (P − 1120px) / 2 + 1.5rem) in, and a margin percentage resolves against P. The child
 * sets its own `max-w`, left-aligned: the narrow tabs (Pricing, Requests, Payouts, Venue).
 */
@Directive({
  selector: '[appConsolePageColumn]',
  host: { class: CONTENT_EDGE },
})
export class ConsolePageColumn {}

/** {@link ConsolePageColumn}'s edge at the full width the header's content spans (1120px less both
 *  gutters): the Daily tab, the pending-approval banner. */
@Directive({
  selector: '[appConsolePageBox]',
  host: {
    class: `block w-full max-w-[calc(1120px_-_3rem)] ${CONTENT_EDGE}`,
  },
})
export class ConsolePageBox {}
