import { Component, computed, model, signal, viewChild } from '@angular/core';

import { focusMover } from '../shared/focus-after-render';
import { distanceKm } from '../shared/geo-distance';
import { LngLat, MapEngineOptions } from '../shared/map-engine';
import { waterSamplerOf } from '../shared/map-water';
import { RivieraMap } from '../shared/riviera-map';
import { RIVIERA_MAP_OPTIONS } from '../shared/riviera-map-options';
import { TouchTarget } from '../shared/touch-target';
import { VenueLocation } from '../shared/venue-views';
import { shoreMoveLabel, snapToShore } from './shore-snap';

/** The scale the server stores (`NUMERIC(_,6)`), so what is shown is what a re-read returns. */
const STORED_DECIMALS = 6;

/**
 * The riviera as every map opens it, plus the one thing only this map needs: its own pixels back,
 * to find the shore under a dropped pin. The flag costs a kept drawing buffer on this map alone.
 */
const PLACER_MAP_OPTIONS: MapEngineOptions = { ...RIVIERA_MAP_OPTIONS, readableImagery: true };

/** The pill both proposal controls wear — the same skin as the field's own two buttons. */
const OFFER_BUTTON =
  'inline-flex touch-manipulation items-center rounded-full border border-riv-field-border ' +
  'px-[14px] text-[13px] font-semibold text-riv-card-ink hover:bg-riv-console-inset/60';

/** A shoreline the placer has offered but the operator has not answered yet. */
interface ShoreOffer {
  /** Where the snap would put the pin, already at the stored scale. */
  readonly at: VenueLocation;
  readonly km: number;
  /** The pin was in the water rather than inland, which is what the sentence says. */
  readonly atSea: boolean;
}

/**
 * The venue's riviera-map pin, placed by hand (tap, drag, Clear); coordinates read back, never
 * typed, so each gesture has a keyboard twin (WCAG 2.1.1): map controls + Place pin at map centre.
 * Neither button is ever `disabled` (it would strand focus, WCAG 2.4.3); Clear is `aria-disabled`.
 * An off-shore pin is OFFERED the shore, never moved: the operator's point stores first, and the
 * style paints rivers and lakes as sea, so an inland pin may be offered a bank. A value only — it
 * saves with the profile (no HTTP, no version token).
 */
@Component({
  selector: 'app-venue-location-field',
  imports: [RivieraMap, TouchTarget],
  host: { class: 'flex flex-col gap-2' },
  template: `<div class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="text-[12.5px] font-semibold text-riv-card-ink">Location on the riviera map</span>
      <span class="flex flex-wrap gap-2">
        <button
          type="button"
          appTouchTarget
          data-testid="venue-location-place"
          class="inline-flex touch-manipulation items-center rounded-full border border-riv-field-border px-[14px] text-[13px] font-semibold text-riv-card-ink hover:bg-riv-console-inset/60"
          (click)="placeAtCentre()"
        >
          Place pin at map centre
        </button>
        <button
          type="button"
          appTouchTarget
          data-testid="venue-location-clear"
          class="inline-flex touch-manipulation items-center rounded-full border border-riv-field-border px-[14px] text-[13px] font-semibold text-riv-card-ink hover:bg-riv-console-inset/60 aria-disabled:opacity-60"
          [attr.aria-disabled]="location() ? null : true"
          (click)="clear()"
        >
          Clear pin
        </button>
      </span>
    </div>

    <app-riviera-map
      class="h-[300px] w-full"
      data-testid="venue-location-map"
      [options]="mapOptions"
      [pin]="pin()"
      [pinDraggable]="true"
      [nearMe]="true"
      pinLabel="Venue location"
      (mapClick)="place($event)"
      (pinMoved)="place($event)"
    />

    <output
      aria-live="polite"
      data-testid="venue-location-readout"
      class="text-[12.5px] leading-[1.5] text-riv-card-ink-soft"
      >{{ readout() }}</output
    >

    <output aria-live="polite" data-testid="venue-location-proposal-status" class="sr-only">{{
      offerSentence()
    }}</output>

    @if (offer()) {
      <div
        data-testid="venue-location-proposal"
        class="flex flex-wrap items-center gap-2 rounded-[18px] border border-riv-field-border bg-riv-console-inset/60 px-3 py-2"
      >
        <p
          aria-hidden="true"
          class="min-w-[180px] flex-1 text-[12.5px] leading-[1.5] text-riv-card-ink"
        >
          {{ offerSentence() }}
        </p>
        <button
          type="button"
          appTouchTarget
          data-testid="venue-location-snap-accept"
          [class]="offerButton"
          (click)="acceptShore()"
        >
          Move to shoreline
        </button>
        <button
          type="button"
          appTouchTarget
          data-testid="venue-location-snap-keep"
          [class]="offerButton"
          (click)="keepOwnPoint()"
        >
          Keep my point
        </button>
      </div>
    }`,
})
export class VenueLocationField {
  /** The venue's pin, two-way bound by the profile form; `null` means the venue is not on the map. */
  readonly location = model<VenueLocation | null>(null);

  private readonly map = viewChild.required(RivieraMap);
  private readonly moveFocus = focusMover();

  protected readonly mapOptions = PLACER_MAP_OPTIONS;
  protected readonly offerButton = OFFER_BUTTON;

  /** The shoreline on the table right now; cleared the moment the operator answers either way. */
  protected readonly offer = signal<ShoreOffer | null>(null);

  /**
   * The offer in words, '' when none. Its live region stays OUTSIDE the `@if`: one mounted already
   * holding text is silent (RV-FE-10), which jsdom and axe can't see (the spec pins element
   * identity). The panel's copy is `aria-hidden`, so it is not read twice.
   */
  protected readonly offerSentence = computed(() => {
    const shore = this.offer();
    if (shore === null) {
      return '';
    }
    const where = shore.atSea ? 'out to sea' : 'inland';
    return `This pin is ${shoreMoveLabel(shore.km)} ${where}. Move it to the shoreline?`;
  });

  protected readonly pin = computed<LngLat | null>(() => {
    const at = this.location();
    return at === null ? null : { lng: at.longitude, lat: at.latitude };
  });

  protected readonly readout = computed(() => {
    const at = this.location();
    return at === null
      ? 'No pin yet — tap the map, or centre it and use Place pin at map centre.'
      : `Latitude ${at.latitude.toFixed(STORED_DECIMALS)}, longitude ${at.longitude.toFixed(STORED_DECIMALS)}`;
  });

  protected place(at: LngLat): void {
    const own = { latitude: rounded(at.lat), longitude: rounded(at.lng) };
    this.location.set(own);
    this.offer.set(this.shoreNear(own));
  }

  protected acceptShore(): void {
    const shore = this.offer();
    if (shore) {
      this.location.set(shore.at);
    }
    this.answered();
  }

  protected keepOwnPoint(): void {
    this.answered();
  }

  /** The keyboard twin of a tap: the map's own controls choose the spot, this commits it. */
  protected placeAtCentre(): void {
    const centre = this.map().currentCenter();
    if (centre) {
      this.place(centre);
    }
  }

  protected clear(): void {
    this.location.set(null);
    this.offer.set(null);
  }

  /**
   * The shoreline from the map's own pixels: project the pin, snap, unproject. `null` where the map
   * can't say (unreadable engine, no water or land in frame, already on the shore) or the move does
   * not survive the stored six decimals — an offer that reads back identical is noise.
   */
  private shoreNear(own: VenueLocation): ShoreOffer | null {
    const handle = this.map().handle();
    const imagery = handle?.readImagery();
    if (handle === undefined || !imagery) {
      return null;
    }
    const isWater = waterSamplerOf(imagery);
    const from = { lng: own.longitude, lat: own.latitude };
    const point = handle.project(from);
    const snapped = snapToShore(point, isWater);
    if (snapped === null) {
      return null;
    }
    const back = handle.unproject(snapped);
    const at = { latitude: rounded(back.lat), longitude: rounded(back.lng) };
    if (at.latitude === own.latitude && at.longitude === own.longitude) {
      return null;
    }
    return {
      at,
      km: distanceKm(from, { lng: at.longitude, lat: at.latitude }),
      atSea: isWater({ x: Math.round(point.x), y: Math.round(point.y) }) === true,
    };
  }

  /** Either answer destroys the block the pressed button sits in, so focus is moved (WCAG 2.4.3). */
  private answered(): void {
    this.offer.set(null);
    this.moveFocus('venue-location-place');
  }
}

function rounded(degrees: number): number {
  return Number(degrees.toFixed(STORED_DECIMALS));
}
