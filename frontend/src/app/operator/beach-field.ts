import { Component, input } from '@angular/core';
import { Field, FormField } from '@angular/forms/signals';

import { BeachCode, REGION_CATALOGUE, beachesInRegion } from '../shared/beaches';
import { FieldErrorFor } from '../shared/field-error-for';
import { TouchTarget } from '../shared/touch-target';

/**
 * The venue's beach picker, for every form that sets it: the fixed catalogue grouped by region,
 * north to south, so an operator chooses a place the platform knows rather than spelling one. The
 * region is never asked for — it is the group the chosen beach sits in.
 *
 * <p>Owns its `<label>` for the same reason `app-booking-mode-field` does: with the control
 * supplied from here, a call-site label would read as empty to `label-has-associated-control`. The
 * host is `display: contents`, so the label is still the direct grid item wherever the form puts it.
 */
@Component({
  selector: 'app-beach-field',
  imports: [FieldErrorFor, FormField, TouchTarget],
  host: { class: 'contents' },
  template: `<label class="flex flex-col gap-1">
    <span class="text-[12.5px] font-semibold text-riv-card-ink">Beach</span>
    <select
      [formField]="field()"
      [attr.data-testid]="testId()"
      appTouchTarget
      class="rounded-[11px] border border-riv-card-border bg-riv-console-inset/60 px-3 py-2 text-[16px] text-riv-card-ink"
      #control
    >
      <option value="" disabled>Choose a beach…</option>
      @for (region of regions; track region.code) {
        <optgroup [label]="region.label">
          @for (beach of beachesOf(region.code); track beach.code) {
            <option [value]="beach.code">{{ beach.label }}</option>
          }
        </optgroup>
      }
    </select>
    @if (field()().touched() && field()().errors().length) {
      <span
        [appFieldErrorFor]="control"
        class="text-[11.5px] font-semibold text-riv-error-ink"
        role="alert"
        >{{ field()().errors()[0].message }}</span
      >
    }
  </label>`,
})
export class BeachField {
  readonly field = input.required<Field<BeachCode | ''>>();
  readonly testId = input.required<string>();

  protected readonly regions = REGION_CATALOGUE;
  protected readonly beachesOf = beachesInRegion;
}
