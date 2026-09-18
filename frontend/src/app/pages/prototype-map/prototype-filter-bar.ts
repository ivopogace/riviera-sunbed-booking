/**
 * PROTOTYPE — throwaway. The beach/region/date controls, shared by the variants that keep a
 * filter bar at all (A, B, D). Variant C replaces it outright with the coast rail, which is the
 * point of C — so this is a shared control, not a shared layout.
 */
import { Component, input, output } from '@angular/core';

import { FieldGlass } from '../../shared/field-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';

@Component({
  selector: 'app-prototype-filter-bar',
  imports: [FieldGlass, PanelGlass, TouchTarget],
  host: { class: 'block' },
  template: `
    <form
      appPanelGlass
      class="items-end rounded-[20px]"
      [class]="
        tight()
          ? 'grid grid-cols-2 gap-2 px-3 py-2.5 [&>p:first-child]:col-span-2'
          : 'flex flex-wrap gap-3 px-4 py-3'
      "
      (submit)="$event.preventDefault()"
    >
      <p class="flex min-w-0 flex-1 flex-col gap-1.5">
        <label
          class="text-[11px] font-bold tracking-[0.1em] uppercase text-riv-ink-faint"
          [attr.for]="id + '-beach'"
          >Beach</label
        >
        <select
          appTouchTarget
          appFieldGlass
          class="w-full cursor-pointer rounded-[12px] px-3 py-2 text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
          [id]="id + '-beach'"
          [value]="state().beach"
          (change)="filtered.emit({ beach: value($event) })"
        >
          <option value="">All beaches</option>
          @for (b of state().beaches; track b.code) {
            <option [value]="b.code" [selected]="b.code === state().beach">{{ b.label }}</option>
          }
        </select>
      </p>
      <p class="flex min-w-0 flex-1 flex-col gap-1.5">
        <label
          class="text-[11px] font-bold tracking-[0.1em] uppercase text-riv-ink-faint"
          [attr.for]="id + '-region'"
          >Region</label
        >
        <select
          appTouchTarget
          appFieldGlass
          class="w-full cursor-pointer rounded-[12px] px-3 py-2 text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
          [id]="id + '-region'"
          [value]="state().region"
          (change)="filtered.emit({ region: value($event) })"
        >
          <option value="">All regions</option>
          @for (r of state().regions; track r.code) {
            <option [value]="r.code" [selected]="r.code === state().region">{{ r.label }}</option>
          }
        </select>
      </p>
      <p class="flex min-w-0 flex-1 flex-col gap-1.5">
        <label
          class="text-[11px] font-bold tracking-[0.1em] uppercase text-riv-ink-faint"
          [attr.for]="id + '-date'"
          >Date</label
        >
        <input
          appTouchTarget
          appFieldGlass
          class="w-full cursor-pointer rounded-[12px] px-3 py-2 text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
          [id]="id + '-date'"
          type="date"
          [value]="state().date"
          (change)="filtered.emit({ date: value($event) })"
        />
      </p>
      @if (!tight()) {
        <p class="ml-auto self-center pl-1 text-right">
          <strong
            class="block text-[30px] leading-none font-bold tracking-[-0.02em] text-riv-accent-ink"
            >{{ state().cards.length }}</strong
          >
          <span class="mt-1 block text-[12px] leading-[14px] text-riv-ink-faint">
            {{ state().cards.length === 1 ? 'venue' : 'venues' }} · {{ state().dateLabel }}
          </span>
        </p>
      }
    </form>
  `,
})
export class PrototypeFilterBar {
  readonly state = input.required<PrototypeState>();
  /** A narrow host (B's rail) drops the count block and tightens the padding. */
  readonly tight = input(false);
  readonly filtered = output<PrototypeFilter>();

  /** Unique per instance, so two bars on one page never collide on a label's `for`. */
  protected readonly id = `pf${Math.random().toString(36).slice(2, 7)}`;

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement | HTMLInputElement).value;
  }
}
