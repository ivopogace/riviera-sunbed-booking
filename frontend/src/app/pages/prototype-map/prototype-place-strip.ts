/**
 * PROTOTYPE — throwaway. Round 5's place strip: the one line a phone's first screen has to say —
 * WHERE this page is looking (a beach, a region, or "near you") and WHEN (today by default) —
 * with J's sentence under it: how many of these still take a booking for today. Pressing the
 * place opens the coast picker; the date is the native picker, dressed as a pill.
 *
 * <p>Three controls, all 44 px, all at the top of the scroll column: they are read once and
 * pressed rarely, so they may live outside thumb reach; the pins and the rows may not.
 */
import { Component, computed, input, output, signal } from '@angular/core';

import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { PrototypeCoastPicker } from './prototype-coast-picker';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';

@Component({
  selector: 'app-prototype-place-strip',
  imports: [PanelGlass, TouchTarget, PrototypeCoastPicker],
  host: { class: 'relative block' },
  template: `
    <div appPanelGlass class="flex flex-col gap-1 px-3 pt-1.5 pb-2" [class]="skin()">
      <div class="flex items-center gap-2">
        <button
          type="button"
          appTouchTarget
          class="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-1.5 text-left hover:bg-white/50"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          <span
            class="text-[19px] leading-none"
            [class]="state().here !== null ? 'text-riv-accent-ink' : 'text-riv-ink-faint'"
            aria-hidden="true"
            >{{ state().here !== null ? '◎' : '⌖' }}</span
          >
          <span class="flex min-w-0 flex-col">
            <span
              class="truncate text-[19px] leading-[1.1] font-bold tracking-[-0.01em] text-riv-ink"
              >{{ title() }}</span
            >
            <span class="truncate text-[12.5px] leading-[1.2] text-riv-ink-soft">{{
              subtitle()
            }}</span>
          </span>
          <span class="ml-auto shrink-0 text-[13px] text-riv-ink-faint" aria-hidden="true">▾</span>
        </button>
        <label class="relative shrink-0">
          <span class="sr-only">Going on</span>
          <input
            appTouchTarget
            class="w-[128px] cursor-pointer rounded-full border border-riv-field-border bg-riv-field-fill px-2.5 text-[13px] font-semibold text-riv-ink [color-scheme:var(--riv-field-scheme)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
            type="date"
            [value]="state().date"
            (change)="onDate($event)"
          />
        </label>
      </div>
      <p class="px-1.5 text-[13px] leading-[1.35] text-riv-ink-soft">
        <strong class="text-riv-accent-ink">{{ selling() }}</strong> of {{ total() }} still take a
        booking for {{ dayWord() }}
        <span class="text-riv-ink-faint">· {{ clock() }}</span>
      </p>
    </div>
    @if (open()) {
      <app-prototype-coast-picker
        [region]="state().region"
        [beach]="state().beach"
        [located]="state().here !== null"
        (picked)="picked.emit($event)"
        (nearMe)="nearMe.emit()"
        (closed)="open.set(false)"
      />
    }
  `,
})
export class PrototypePlaceStrip {
  readonly state = input.required<PrototypeState>();
  /** The place as the variant names it: `Dhërmi · Himarë`, `Himarë`, `Near you · Dhërmi`. */
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly selling = input.required<number>();
  readonly total = input.required<number>();
  readonly clock = input.required<string>();
  readonly dayWord = input('today');
  /** Extra classes on the glass — a variant's own radius and shadow (`riviera-tailwind` rule 3). */
  readonly skin = input('');

  readonly picked = output<PrototypeFilter>();
  readonly nearMe = output<void>();

  protected readonly open = signal(false);
  protected readonly located = computed(() => this.state().here !== null);

  protected onDate(event: Event): void {
    this.picked.emit({ date: (event.target as HTMLInputElement).value });
  }
}
