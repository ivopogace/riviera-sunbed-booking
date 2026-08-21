import { Component, input } from '@angular/core';
import { Field, FormField } from '@angular/forms/signals';

import { BookingMode } from '../shared/venue-views';
import { TouchTarget } from '../shared/touch-target';

/**
 * The venue's booking-mode picker, for every form that sets it. The two mode names are the
 * operator-facing statement of the Instant/Request split (ADR-0002).
 *
 * <p>The component owns its `<label>` rather than binding to one the call site writes: with the
 * control supplied from here, a call-site label would be empty in its own template, which
 * `label-has-associated-control` cannot tell apart from a label with no control at all. The host is
 * `display: contents`, so the label is still the direct grid item — which matters, because forms
 * group this field with different neighbours. The field itself is shared; the layout around it is not.
 */
@Component({
  selector: 'app-booking-mode-field',
  imports: [FormField, TouchTarget],
  host: { class: 'contents' },
  template: `<label class="flex flex-col gap-1">
    <span class="text-[12.5px] font-semibold text-(--riv-card-ink)">Booking mode</span>
    <select
      [formField]="field()"
      [attr.data-testid]="testId()"
      appTouchTarget
      class="rounded-[11px] border border-(--riv-card-border) bg-white/60 px-3 py-2 text-[14px] text-(--riv-card-ink)"
    >
      <option value="INSTANT">Instant Book</option>
      <option value="REQUEST">Request to Book</option>
    </select>
  </label>`,
})
export class BookingModeField {
  readonly field = input.required<Field<BookingMode>>();
  readonly testId = input.required<string>();
}
