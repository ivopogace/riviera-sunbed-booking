import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';

import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { VenuePin } from '../home/pin-crowding';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { fitBounds, pinBounds } from './camera';

/**
 * PROTOTYPE — the map + pins + preview wiring every variant shares, exactly the trio `Home`
 * composes (`app-riviera-map` / `app-venue-pin-layer` / `app-venue-preview-card`), so the four
 * variants differ only in the SHAPE of the pane and what sits around it, never in how the map
 * itself behaves. The one thing this owns that `Home` doesn't: fitting the camera to the actual
 * measured pane once the map boots (`camera.ts`'s `fitBounds`) instead of the shipped default
 * camera constant — every variant's pane is a different shape, so each earns its own zoom.
 */
@Component({
  selector: 'app-map-surface',
  imports: [RivieraMap, VenuePinLayer, VenuePreviewCard],
  host: { class: 'relative block' },
  template: `
    <app-riviera-map class="h-full w-full" (mapClick)="select(null)" />
    <app-venue-pin-layer
      [pins]="pins()"
      [map]="map()?.handle()"
      [selected]="selected()"
      [maxZoom]="maxZoom"
      (chosen)="select($event)"
      (narrowed)="($event)"
    />
    @if (selectedCard(); as card) {
      <app-venue-preview-card
        class="absolute inset-x-3 bottom-3 z-[5]"
        [card]="card"
        [date]="date()"
        (closed)="select(null)"
      />
    }
  `,
})
export class MapSurface {
  readonly pins = input.required<readonly VenuePin[]>();
  readonly date = input.required<string>();
  readonly selected = input<string | null>(null);

  readonly venueSelected = output<string | null>();

  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly map = viewChild(RivieraMap);
  private readonly mapEl = viewChild(RivieraMap, { read: ElementRef });
  private fitted = false;

  protected readonly selectedCard = () => {
    const id = this.selected();
    return id === null ? null : (this.pins().find((pin) => pin.id === id)?.card ?? null);
  };

  constructor() {
    effect(() => {
      const handle = this.map()?.handle();
      const el = this.mapEl()?.nativeElement as HTMLElement | undefined;
      if (!handle || !el || this.fitted) {
        return;
      }
      this.fitted = true;
      const box = pinBounds(this.pins());
      const rect = el.getBoundingClientRect();
      handle.setView(fitBounds(box, rect.width, rect.height));
    });
    /** Follow a selection made off-map (a ledger row, a rail card) by easing the camera to it. */
    effect(() => {
      const id = this.selected();
      const handle = this.map()?.handle();
      if (!id || !handle || !this.fitted) {
        return;
      }
      const at = this.pins().find((pin) => pin.id === id)?.at;
      if (at) {
        handle.easeTo({ center: at, zoom: Math.max(handle.view().zoom, 12) });
      }
    });
  }

  protected select(id: string | null): void {
    this.venueSelected.emit(id);
  }
}
