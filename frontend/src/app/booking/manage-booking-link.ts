import { Component } from '@angular/core';

/**
 * The link from a completed booking to its management page. Supplies the label and the
 * `manage-link` test id; the route and the skin stay with the call site.
 *
 * <p>An attribute selector on the caller's own `<a>`, which is load-bearing rather than stylistic:
 * `.btn-primary` and `.link` are declared in each page's `styleUrl` stylesheet, so emulated
 * encapsulation compiles them to `.btn-primary[_ngcontent-<page>]`. An anchor rendered from this
 * component's template would carry this component's stamp instead, match neither rule, and lose
 * its styling silently. The anchor therefore stays in the page's view; only its text comes from here.
 *
 * <p>`elements-content` sees an anchor with no children in the caller's template and cannot know
 * the content arrives from a directive, so `eslint.config.js` names this attribute in that rule's
 * `allowList` — teaching the rule about this one directive rather than silencing it for a file.
 */
@Component({
  selector: 'a[appManageBookingLink]',
  host: { 'data-testid': 'manage-link' },
  template: `View or manage this booking`,
})
export class ManageBookingLink {}
