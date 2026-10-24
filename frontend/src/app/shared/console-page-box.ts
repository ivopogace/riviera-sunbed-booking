import { Directive } from '@angular/core';

/**
 * The console's one 1120px page box (#1589), the header row's and tab rail's; every 1120px utility
 * is here. Its content edge is the box's plus the row's `px-6`: where the wordmark and the rail's
 * first tab start.
 */
export const CONSOLE_PAGE_ROW = 'mx-auto w-full max-w-[1120px]';

/** {@link CONSOLE_PAGE_ROW} on a full-bleed row in a template; the row supplies its own gutter. */
@Directive({
  selector: '[appConsolePageRow]',
  host: { class: CONSOLE_PAGE_ROW },
})
export class ConsolePageRow {}

/** The box's content edge as a `fixed` box's `left`, its containing block the full-bleed header
 *  (the venue switch's popover): half the box in from the centre plus the `px-6`, or the `px-6`
 *  alone once the header is narrower. One literal string, so Tailwind's scan sees it whole. */
export const FIXED_CONTENT_EDGE = 'left-[max(1.5rem,calc(50%_-_560px_+_1.5rem))]';

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
