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
