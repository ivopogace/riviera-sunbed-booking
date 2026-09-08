import { Type } from '@angular/core';

/**
 * One console destination as both rails describe it — the text rail from `sm` up and the phone
 * rail below it (`console-shell.ts`, `admin/admin-console-tabs.ts`). The venue console's table
 * holds child paths under `/operator/:venueId`, the admin console's absolute ones; the shell turns
 * either into a link. `group` is what the desktop rail draws a divider at and the More sheet heads
 * a group with; `glyph` names the inline-SVG component (`console-glyphs.ts`) the phone rail and the
 * sheet render; `short` is the phone slot's label where the full one would wrap at 344px.
 */
export interface ConsoleDestination {
  readonly path: string;
  readonly label: string;
  readonly short?: string;
  readonly glyph: Type<unknown>;
  /** One line under the label in the More sheet. */
  readonly hint: string;
  readonly group: string;
  /** Whether the slot carries the live Requests badge. */
  readonly badge?: boolean;
  readonly testId?: string;
}

/**
 * The venue console's landing tab — the child path `/operator/:venueId` redirects to, and the tab
 * every caller assumes while that redirect is still in flight (the shell's venue switcher and its
 * palette rows, which keep the open tab across a venue switch and fall back to this off the
 * console). One constant so a picked venue and a switched-to venue can never disagree.
 *
 * <p>It is the Daily view because that is what a trading venue opens every day; the set-up tabs are
 * deliberate destinations, reached from the rail or deep-linked (a freshly created venue goes
 * straight to `beach-map` — `operator/venue-create-card.ts` — since it has no map to run a day on).
 */
export const VENUE_CONSOLE_LANDING_TAB = 'daily';
