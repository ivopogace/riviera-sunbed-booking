/**
 * PROTOTYPE variant G — **Round 1's verdict, rendered**. Round 1 concluded "ship A's geometry with
 * C's instrument" without building it; this is that page, so the verdict can be judged from a
 * screenshot like everything else: A's two full-bleed panes with the map at `clamp(520px,44vw,
 * 900px)`, and C's north-to-south coast rail leading the left column in place of the Beach and
 * Region selects. A control, not a proposal — round 2's own answers are E and F.
 */
import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { FieldGlass } from '../../shared/field-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { fitHandleToPins } from './prototype-camera';
import { COAST } from './prototype-coast';
import { PrototypeVenueCard } from './prototype-venue-card';

@Component({
  selector: 'app-variant-verdict',
  imports: [FieldGlass, PanelGlass, TouchTarget, RivieraMap, VenuePinLayer, PrototypeVenueCard],
  host: { class: 'block' },
  template: `
    <div
      class="grid h-[calc(100dvh-68px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_clamp(520px,44vw,900px)]"
    >
      <div class="grid min-h-0 grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)]">
        <!-- C's rail, leading A's left column. -->
        <nav
          appPanelGlass
          class="m-3 mr-0 hidden min-h-0 flex-col overflow-hidden rounded-[22px] lg:flex"
          aria-label="The coast, north to south"
        >
          <p
            class="shrink-0 px-4 pt-3.5 pb-2 text-[11px] font-bold tracking-[0.1em] text-riv-ink-faint uppercase"
          >
            North ↓ South
          </p>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
            @for (region of coast; track region.code) {
              <p class="px-2 pt-2.5 pb-1 text-[13px] font-bold text-riv-ink">{{ region.label }}</p>
              @for (b of region.beaches; track b.code) {
                <button
                  type="button"
                  appTouchTarget
                  class="flex w-full items-center gap-2 rounded-[12px] px-2 text-left text-[13.5px] text-riv-ink-soft hover:bg-white/55 aria-pressed:bg-riv-accent-ink aria-pressed:font-semibold aria-pressed:text-riv-on-accent-ink"
                  [attr.aria-pressed]="state().beach === b.code"
                  (click)="filtered.emit({ beach: b.code })"
                >
                  <span class="min-w-0 flex-1 truncate">{{ b.label }}</span>
                  <span class="shrink-0 text-[12px] tabular-nums opacity-70">{{ b.from }}</span>
                  <span
                    class="shrink-0 rounded-full bg-riv-ink/10 px-1.5 text-[11px] font-bold tabular-nums text-riv-ink aria-pressed:bg-white/25"
                    aria-hidden="true"
                    >{{ b.venues }}</span
                  >
                </button>
              }
            }
          </div>
          @if (state().beach) {
            <button
              type="button"
              appTouchTarget
              class="m-2 shrink-0 rounded-[12px] border-2 border-riv-accent-border bg-riv-accent-fill px-3 text-[13px] font-bold text-riv-accent-ink"
              (click)="filtered.emit({ beach: '' })"
            >
              Show the whole coast
            </button>
          }
        </nav>

        <div class="min-w-0 overflow-y-auto px-4 pt-4 pb-16 scrollbar-thin lg:px-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h1 class="text-[22px] leading-[1.1] font-bold tracking-[-0.02em] text-riv-ink">
              {{ state().beach ? beachName() : 'The whole coast' }}
            </h1>
            <p class="flex items-center gap-2 text-[13px] text-riv-ink-soft">
              <strong class="text-[15px] font-extrabold text-riv-accent-ink">{{
                state().cards.length
              }}</strong>
              venues on
              <input
                appTouchTarget
                appFieldGlass
                class="cursor-pointer rounded-[10px] px-2 text-[13px]"
                type="date"
                aria-label="Date"
                [value]="state().date"
                (change)="filtered.emit({ date: dateOf($event) })"
              />
            </p>
          </div>
          <ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(252px,1fr))] gap-4">
            @for (card of state().cards; track card.id) {
              <li>
                <app-prototype-venue-card
                  [card]="card"
                  [selected]="selected() === card.id"
                  (hovered)="selected.set($event)"
                />
              </li>
            }
          </ul>
        </div>
      </div>

      <div #pane class="relative hidden p-3 lg:block">
        <app-riviera-map class="size-full" [nearMe]="true" />
        <app-venue-pin-layer
          [pins]="state().pins"
          [map]="mapHandle()"
          [selected]="selectedPin()"
          [maxZoom]="maxZoom"
          (chosen)="selected.set(+$event)"
          (narrowed)="filtered.emit({ beach: $event })"
        />
      </div>
    </div>
  `,
})
export class VariantVerdict {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly coast = COAST;
  private readonly map = viewChild(RivieraMap);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly selected = signal<number | null>(null);
  protected readonly selectedPin = computed(() => {
    const id = this.selected();
    return id === null ? null : String(id);
  });
  protected readonly beachName = computed(
    () => this.state().beaches.find((b) => b.code === this.state().beach)?.label ?? '',
  );
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');

  protected dateOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  constructor() {
    effect(() => {
      const handle = this.mapHandle();
      const pins = this.state().pins;
      if (handle !== undefined) {
        fitHandleToPins(
          handle,
          pins.map((p) => p.at),
          this.pane().nativeElement,
        );
      }
    });
  }
}
