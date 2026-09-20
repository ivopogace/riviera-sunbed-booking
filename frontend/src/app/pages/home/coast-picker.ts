import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

import { BEACH_CATALOGUE, REGION_CATALOGUE } from '../../shared/beaches';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { lowestFromPrice } from './pin-crowding';
import { VenueCard } from './venue-card';

/** A row of the coast index: a place with its venue count and its lowest from-price. */
export interface PickerPlace {
  readonly code: string;
  readonly label: string;
  readonly venues: number;
  readonly from: string | null;
}

/** A region of the index with the beaches under it, each carrying a venue. */
export interface PickerRegion extends PickerPlace {
  readonly beaches: readonly PickerPlace[];
}

/** What a pick names: a region, or a beach with its region. */
export interface PickedPlace {
  readonly region: string;
  readonly beach: string;
}

/** A 44 px row of the index; the chosen one lit as the accent pair. */
const ROW =
  'flex w-full touch-manipulation items-center gap-2 rounded-[12px] px-3 text-left text-[15px] text-riv-ink ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink';

/**
 * The coast index, built from the cards the page already has: every region with a venue in
 * north-to-south catalogue order, its beaches under it, counts and the lowest from-price.
 */
export function coastIndex(cards: readonly VenueCard[]): readonly PickerRegion[] {
  const byBeach = new Map<string, VenueCard[]>();
  for (const card of cards) {
    const on = byBeach.get(card.beach) ?? [];
    on.push(card);
    byBeach.set(card.beach, on);
  }
  return REGION_CATALOGUE.flatMap((region) => {
    const beaches = BEACH_CATALOGUE.filter(
      (entry) => entry.region === region.code && byBeach.has(entry.code),
    ).map((entry) => {
      const on = byBeach.get(entry.code) ?? [];
      return { code: entry.code, label: entry.label, venues: on.length, from: lowestFromPrice(on) };
    });
    if (beaches.length === 0) {
      return [];
    }
    const on = beaches.flatMap((beach) => byBeach.get(beach.code) ?? []);
    return [
      {
        code: region.code,
        label: region.label,
        venues: on.length,
        from: lowestFromPrice(on),
        beaches,
      },
    ];
  });
}

/**
 * The coast picker: the whole coast as a CHOOSER, never as the page. A sheet with the coast
 * index — every region and every beach that has a venue, its count and its from-price — as 44 px
 * rows, Near me at the head. There is no `Whole coast`, because the coast is not a state on any
 * screen: a region is the widest frame a phone can hold.
 *
 * <p>Keep the `@if` outside this component: it is created with the choice and destroyed with it,
 * which is what lets it take focus on the way in (WCAG 2.4.3); focus back out is the caller's,
 * via `focusMover()`, since this component is gone by then.
 */
@Component({
  selector: 'app-coast-picker',
  imports: [NgTemplateOutlet, PanelGlass, TouchTarget],
  host: {
    class: 'contents',
    '(keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      data-testid="picker-backdrop"
      class="fixed inset-0 z-[30] bg-riv-ink/35 backdrop-blur-[2px]"
      aria-hidden="true"
      (click)="closed.emit()"
    ></div>
    <div
      #panel
      appPanelGlass
      data-testid="coast-picker"
      role="dialog"
      aria-label="Choose a place on the coast"
      tabindex="-1"
      class="fixed inset-x-0 bottom-0 z-[31] flex max-h-[86dvh] flex-col rounded-t-[26px] shadow-[0_-16px_50px_rgba(7,42,58,0.35)]"
    >
      <div class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <h2 class="text-[17px] font-bold text-riv-ink">The coast, north to south</h2>
        <button
          type="button"
          appTouchTarget
          data-testid="picker-close"
          class="ml-auto -mr-2 inline-flex touch-manipulation items-center justify-center rounded-full text-[22px] leading-none text-riv-ink-soft hover:text-riv-ink"
          aria-label="Close"
          (click)="closed.emit()"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div class="flex shrink-0 px-3 pb-2">
        <button
          type="button"
          appTouchTarget
          data-testid="picker-near-me"
          class="inline-flex flex-1 touch-manipulation items-center justify-center gap-2 rounded-full bg-riv-accent-ink px-4 text-[14px] font-semibold text-riv-on-accent-ink"
          [attr.aria-pressed]="located()"
          (click)="nearMe.emit()"
        >
          <span aria-hidden="true">◎</span>&ngsp;Near me
        </button>
      </div>
      <ul
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(12px,env(safe-area-inset-bottom))] scrollbar-thin"
      >
        @for (region of regions(); track region.code) {
          <li>
            <button
              type="button"
              appTouchTarget
              data-testid="picker-row"
              [class]="ROW + ' font-bold'"
              [attr.aria-current]="beach() === '' && region.code === this.region() ? 'true' : null"
              (click)="picked.emit({ region: region.code, beach: '' })"
            >
              <ng-container *ngTemplateOutlet="row; context: { $implicit: region }" />
            </button>
            <ul class="pl-4">
              @for (place of region.beaches; track place.code) {
                <li>
                  <button
                    type="button"
                    appTouchTarget
                    data-testid="picker-row"
                    [class]="ROW"
                    [attr.aria-current]="beach() === place.code ? 'true' : null"
                    (click)="picked.emit({ region: region.code, beach: place.code })"
                  >
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: place }" />
                  </button>
                </li>
              }
            </ul>
          </li>
        }
      </ul>
    </div>

    <ng-template #row let-place>
      <span class="min-w-0 flex-1 truncate">{{ place.label }}</span
      >&ngsp;<span class="shrink-0 text-[13px] opacity-80"
        >{{ place.venues }} {{ place.venues === 1 ? 'venue' : 'venues' }}</span
      >
      @if (place.from; as from) {
        &ngsp;<span class="shrink-0 text-[13px] font-semibold">from {{ from }}</span>
      }
    </ng-template>
  `,
})
export class CoastPicker {
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly ROW = ROW;

  /** The coast index, from {@link coastIndex}. */
  readonly regions = input.required<readonly PickerRegion[]>();
  /** The focused region's code. */
  readonly region = input('');
  /** The chosen beach's code, `''` for the region. */
  readonly beach = input('');
  /** The tourist is placed: Near me is lit. */
  readonly located = input(false);

  readonly picked = output<PickedPlace>();
  readonly nearMe = output<void>();
  readonly closed = output<void>();

  constructor() {
    afterNextRender({ write: () => this.panel().nativeElement.focus() });
  }
}
