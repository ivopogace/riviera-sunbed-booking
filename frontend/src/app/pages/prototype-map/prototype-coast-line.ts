/**
 * PROTOTYPE — throwaway. Round 8's coast LINE: the whole coast as a chooser across the top of the
 * desktop panel, not as a map. Sixteen beaches as dots on one line in the catalogue's
 * north-to-south order, Velipojë at the left and Ksamil at the right, grouped into their six
 * regions — each run a button with the region's name, venue count and from-price — so the map
 * pane below always holds a region, which is the only set a pane can frame (finding 2: the
 * whole coast is 4.5 times taller than wide and fence-bound at any width).
 *
 * <p>A run's width grows with its beach count from a floor a name fits in; the chosen region's
 * run is lit, and a chosen beach lights its dot. The coast picker stays for the full index.
 */
import { Component, computed, input, output } from '@angular/core';

import { TouchTarget } from '../../shared/touch-target';
import { COAST } from './prototype-coast';
import { PrototypeFilter } from './prototype-map-page';

@Component({
  selector: 'app-prototype-coast-line',
  imports: [TouchTarget],
  host: { class: 'block' },
  template: `
    <div class="relative px-3 pt-1 pb-2" role="group" aria-label="The coast, north to south">
      <div
        class="pointer-events-none absolute inset-x-6 top-[21px] h-0.5 rounded-full bg-riv-field-border"
        aria-hidden="true"
      ></div>
      <div class="flex gap-1">
        @for (run of runs(); track run.code) {
          <button
            type="button"
            appTouchTarget
            data-run
            class="group flex min-w-0 flex-col items-center rounded-[12px] px-1 pt-1 pb-1 text-riv-ink hover:bg-riv-field-fill aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink"
            [style.flex-grow]="run.beaches.length"
            [style.flex-basis.px]="run.basis"
            [attr.aria-current]="region() === run.code ? 'true' : null"
            [attr.aria-label]="run.label + ', ' + run.venues + ' venues from ' + run.from"
            (click)="picked.emit({ region: run.code, beach: '', here: null })"
          >
            <span class="flex h-[26px] w-full items-center justify-evenly" aria-hidden="true">
              @for (b of run.beaches; track b.code) {
                <span
                  class="block size-2.5 rounded-full border-2 border-riv-on-accent-ink bg-riv-accent-ink group-aria-[current]:border-riv-accent-ink group-aria-[current]:bg-riv-on-accent-ink"
                  [class.scale-150]="beach() === b.code"
                ></span>
              }
            </span>
            <span class="truncate text-[13px] leading-[16px] font-bold" aria-hidden="true">{{
              run.label
            }}</span>
            <span
              class="text-[11.5px] leading-[14px] font-semibold text-riv-ink-soft group-aria-[current]:text-riv-on-accent-ink"
              aria-hidden="true"
              >{{ run.venues }} · {{ run.from }}</span
            >
          </button>
        }
      </div>
    </div>
  `,
})
export class PrototypeCoastLine {
  readonly region = input.required<string>();
  readonly beach = input.required<string>();
  readonly picked = output<PrototypeFilter>();

  /** The regions as runs: the floor a name fits in, growing with the beach count. */
  protected readonly runs = computed(() =>
    COAST.map((r) => ({ ...r, basis: Math.max(64, 12 * r.label.length) })),
  );
}
