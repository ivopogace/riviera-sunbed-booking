import { Component, computed, input } from '@angular/core';
import { Field, FormField } from '@angular/forms/signals';

import { FieldErrorFor } from '../shared/field-error-for';
import { TouchTarget } from '../shared/touch-target';

/**
 * The venue's evening-before cutoff field, for every form that sets it — labelled as the
 * free-cancellation deadline (invariant #10; the on-day sales close is its own control). The label
 * names the zone: the deadline is `Europe/Tirane` wall-clock (invariant #6), and an operator
 * reading it in their own zone would set the wrong hour.
 *
 * <p>Owns its `<label>` and hosts on `display: contents`, so each form places it in its own grid.
 */
@Component({
  selector: 'app-booking-cutoff-field',
  imports: [FieldErrorFor, FormField, TouchTarget],
  host: { class: 'contents' },
  template: `<label class="flex flex-col gap-1">
    <span class="text-[12.5px] font-semibold text-riv-card-ink"
      >Free-cancellation deadline (Europe/Tirane)</span
    >
    <input
      type="time"
      [formField]="field()"
      [attr.data-testid]="testId()"
      appTouchTarget
      class="rounded-[11px] border border-riv-card-border bg-riv-console-inset/60 px-3 py-2 text-[16px] text-riv-card-ink"
      #cutoffControl
    />
    @if (state().touched() && state().errors().length) {
      <span
        [appFieldErrorFor]="cutoffControl"
        class="text-[11.5px] font-semibold text-riv-error-ink"
        role="alert"
        >{{ state().errors()[0].message }}</span
      >
    }
  </label>`,
})
export class BookingCutoffField {
  readonly field = input.required<Field<string>>();
  readonly testId = input.required<string>();

  protected readonly state = computed(() => this.field()());
}
