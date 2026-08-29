import { Component, computed, input } from '@angular/core';
import { Field, FormField } from '@angular/forms/signals';

import { TouchTarget } from '../shared/touch-target';

/**
 * The venue's evening-before cutoff field, for every form that sets it — labelled by its one
 * remaining meaning, the free-cancellation deadline (invariant #10; the on-day sales close is its
 * own three-choice control). The label names the zone explicitly — the deadline is a wall-clock
 * time in `Europe/Tirane` (invariant #6), and an operator reading it in their own zone would set
 * the wrong hour.
 *
 * <p>Like the booking-mode field beside it, the component owns its `<label>` and hosts on
 * `display: contents`: forms place this field in different grids, so the field is shared and the
 * layout is not.
 */
@Component({
  selector: 'app-booking-cutoff-field',
  imports: [FormField, TouchTarget],
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
      class="rounded-[11px] border border-riv-card-border bg-white/60 px-3 py-2 text-[14px] text-riv-card-ink"
    />
    @if (state().touched() && state().errors().length) {
      <span class="text-[11.5px] font-semibold text-[#a3160e]" role="alert">{{
        state().errors()[0].message
      }}</span>
    }
  </label>`,
})
export class BookingCutoffField {
  readonly field = input.required<Field<string>>();
  readonly testId = input.required<string>();

  protected readonly state = computed(() => this.field()());
}
