import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The link a guest follows from a just-completed booking to its management page — the label, the
 * `manage-link` test id and the route into `/booking/:code`, all of which the confirmation page
 * and the payment page used to build separately.
 *
 * <p>An element selector wrapping the anchor, rather than an attribute selector on the call site's
 * own `<a>`: with the label supplied from here, the call site's anchor would be empty in its own
 * template, which is indistinguishable from a genuinely empty link to `elements-content`. The host
 * is `display: contents`, so the anchor is still the direct child of whatever lays the page out.
 * Only the skin varies between the two pages, so it is the second input.
 */
@Component({
  selector: 'app-manage-booking-link',
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `<a [routerLink]="['/booking', code()]" [class]="skin()" data-testid="manage-link"
    >View or manage this booking</a
  >`,
})
export class ManageBookingLink {
  readonly code = input.required<string>();
  readonly skin = input.required<string>();
}
