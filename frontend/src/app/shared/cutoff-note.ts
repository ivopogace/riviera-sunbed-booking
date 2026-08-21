import { Component } from '@angular/core';

import { ClockIcon } from './clock-icon';

/**
 * The cutoff rule as a tourist reads it, stated once for every point-of-sale surface that
 * shows it — Discover and the beach map today. **Display only: the server enforces the real
 * cutoff** (invariant #4), and nothing here participates in fencing a date.
 *
 * <p>The sentence lives in this template and nowhere else in the source. It previously lived in
 * both surface templates, and drifted: one was re-worded and the other silently kept the old
 * wording, with both unit suites green throughout, because each spec pinned its own template.
 * A shared *constant* would have fixed the sentence alone; a component fixes the sentence, the
 * test id, the glyph, the `<span>` and the flex layout together, and keeps the copy in a
 * template — where `6&nbsp;PM` stays a reviewable entity instead of an invisible byte.
 *
 * <p>An **attribute selector on the native `<p>`**, so the element the call site already wrote
 * is the element that renders: paragraph semantics survive, and every skin class stays on the
 * painted box rather than on a wrapper. This is Angular's recommended way to reuse a native
 * element, and it is what makes adoption a no-op for layout and for assistive tech.
 *
 * <p>Zero API surface, for the same reason `ClockIcon` has none: the cascade already gives each
 * call site full control. The host carries only what both surfaces share — the flex row, its
 * gap, the line height — while ink, type scale, spacing and any glass treatment are written at
 * the call site. **No `border-radius` here**, so a surface's own radius has nothing to race.
 * A call site resizes the glyph with a plain descendant variant (`[&_svg]:size-[15px]`), which
 * compiles to a global rule and needs no input.
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
