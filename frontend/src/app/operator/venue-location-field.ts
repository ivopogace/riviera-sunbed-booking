import { Component, computed, model } from '@angular/core';

import { LngLat } from '../shared/map-engine';
import { RivieraMap } from '../shared/riviera-map';
import { TouchTarget } from '../shared/touch-target';
import { VenueLocation } from '../shared/venue-views';

/** The scale the server stores (`NUMERIC(_,6)`), so what is shown is what a re-read returns. */
const STORED_DECIMALS = 6;

/**
 * The venue's pin on the riviera map, placed by hand: tap the map to drop it, drag it to adjust,
 * Clear to unpin. The coordinates read back beside the map, never as an input — an operator places
 * a venue by looking at the coast, not by typing degrees.
 *
 * <p>A small cousin of the layout editor: it owns no map of its own, only what the riviera-map
 * component reports through the engine seam. The pin saves with the rest of the profile, so this
 * field holds a value and nothing else — no HTTP, no version token.
 */
@Component({
  selector: 'app-venue-location-field',
  imports: [RivieraMap, TouchTarget],
  host: { class: 'flex flex-col gap-2' },
  template: `<div class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="text-[12.5px] font-semibold text-riv-card-ink">Location on the riviera map</span>
      <button
        type="button"
        appTouchTarget
        data-testid="venue-location-clear"
        class="inline-flex items-center rounded-full border border-riv-field-border px-[14px] text-[13px] font-semibold text-riv-card-ink hover:bg-riv-console-inset/60 disabled:opacity-50"
        [disabled]="!location()"
        (click)="clear()"
      >
        Clear pin
      </button>
    </div>

    <app-riviera-map
      class="h-[300px] w-full"
      data-testid="venue-location-map"
      [pin]="pin()"
      [pinDraggable]="true"
      pinLabel="Venue location — drag to adjust"
      (mapClick)="place($event)"
      (pinMoved)="place($event)"
    />

    <output
      aria-live="polite"
      data-testid="venue-location-readout"
      class="text-[12.5px] leading-[1.5] text-riv-card-ink-soft"
      >{{ readout() }}</output
    >`,
})
export class VenueLocationField {
  /** The venue's pin, two-way bound by the profile form; `null` means the venue is not on the map. */
  readonly location = model<VenueLocation | null>(null);

  protected readonly pin = computed<LngLat | null>(() => {
    const at = this.location();
    return at === null ? null : { lng: at.longitude, lat: at.latitude };
  });

  protected readonly readout = computed(() => {
    const at = this.location();
    return at === null
      ? 'No pin yet — tap the map to place this venue.'
      : `Latitude ${at.latitude.toFixed(STORED_DECIMALS)}, longitude ${at.longitude.toFixed(STORED_DECIMALS)}`;
  });

  protected place(at: LngLat): void {
    this.location.set({ latitude: rounded(at.lat), longitude: rounded(at.lng) });
  }

  protected clear(): void {
    this.location.set(null);
  }
}

function rounded(degrees: number): number {
  return Number(degrees.toFixed(STORED_DECIMALS));
}
