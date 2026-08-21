import { Component, input } from '@angular/core';

/**
 * The admin console's access-denied line, stated once for all seven admin pages. Each page used
 * to carry its own copy of the sentence and its styling, which is the drift shape #735 removed
 * from the cutoff note: every page's spec pinned that page's own template, so a copy edit to one
 * left the other six green and stale.
 *
 * <p>An attribute selector on the native `<p>`, so each page's element and its place in the
 * `@else if` chain are untouched. The test id stays per-page — the seven specs each assert their
 * own — so it is the component's one input rather than a fixed host attribute.
 */
@Component({
  selector: 'p[appAdminForbidden]',
  host: {
    class: 'mt-4 text-[15px] text-(--riv-ink-soft)',
    '[attr.data-testid]': 'testId()',
  },
  template: `You don't have access to this page.`,
})
export class AdminForbidden {
  readonly testId = input.required<string>();
}
