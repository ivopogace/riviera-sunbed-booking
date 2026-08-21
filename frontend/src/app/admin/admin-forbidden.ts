import { Component, input } from '@angular/core';

/**
 * The admin console's access-denied line, for every admin page that gates on the role.
 *
 * <p>An attribute selector on the native `<p>`, so each page keeps its element and its place in the
 * surrounding `@else if` chain. The test id is per-page — each page's spec asserts its own — so it
 * is this component's one input rather than a fixed host attribute.
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
