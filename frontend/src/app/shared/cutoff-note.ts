import { Component } from '@angular/core';

import { ClockIcon } from './clock-icon';

/**
 * The cutoff rule as a tourist reads it, for every point-of-sale surface that shows it.
 * **Display only: the server enforces the real cutoff** (invariant #4); nothing here participates
 * in fencing a date.
 *
 * <p>This template is the sentence's only home in the source. Keeping it in a template rather than
 * a string constant is what keeps `6&nbsp;PM` a reviewable entity instead of an invisible byte.
 *
 * <p>An attribute selector on the native `<p>`, so the element the call site wrote is the element
 * that renders: paragraph semantics survive and every skin class stays on the painted box.
 *
 * <p>Zero API surface. The host carries only what every surface shares — the flex row, its gap, the
 * line height — while ink, type scale, spacing and any glass treatment are the call site's. **No
 * `border-radius` here**, so a surface's own radius has nothing to race. A call site resizes the
 * glyph with a descendant variant (`[&_svg]:size-[15px]`), which needs no input.
 */
@Component({
  imports: [ClockIcon],
  selector: 'p[appCutoffNote]',
  host: {
    class: 'inline-flex items-center gap-1 leading-[1.35]',
    'data-testid': 'cutoff-note',
  },
  template: `<app-clock-icon />
    <span
      >Book any day from tomorrow — each day’s sales close at 6&nbsp;PM the evening before.</span
    >`,
})
export class CutoffNote {}
