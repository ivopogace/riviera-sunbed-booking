import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';

import {
  BEACH_CATALOGUE,
  BeachCode,
  BeachEntry,
  REGION_CATALOGUE,
  RegionCode,
  RegionEntry,
  beachEntry,
} from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { LngLat, MapView } from '../../shared/map-engine';
import { minorUnitsToEuros } from '../../shared/money';
import { PanelGlass } from '../../shared/panel-glass';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { BeachMapCanvas, BeachMapRowDef } from '../../shared/beach-map-canvas';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { fitView, frameOf, optionsFor, PaneBox, nudged, zoomForCoastKm } from './prototype-camera';
import { Pane } from './prototype-pane';
import { PrototypeState } from './prototype-state';

/** The pin pill's own height plus the dock's reach: what the fit keeps clear of the pane's edges. */
const FIT_PAD_PX = 96;
/**
 * The closest the bay camera ever goes, expressed as coast rather than as a zoom number: three
 * venues 300 m apart otherwise "fit" at zoom 16, which shows their car park and no bay at all.
 */
const BAY_KM = 3;
/** How far west of its venues the bay camera sits, as a share of the pane — see `withSeaMargin`. */
const SEA_SHARE = 0.16;
/** How much of the pane's bottom the open venue's dock covers, so the fit stops there. */
const DOCK_PX = 330;

/** One row of the docked set grid — three rows is what the dock's height has room for. */
interface SetRow {
  readonly code: string;
  readonly priceLabel: string | null;
  readonly zoneStart: boolean;
  readonly tileCount: number;
  readonly tiles: readonly { readonly id: number; readonly free: boolean }[];
}

/**
 * PROTOTYPE — variant A, **Bay theatre**. The page IS the map.
 *
 * <p>Premise, straight out of the measurement: a 1440 px-wide pane is fenced to a zoom floor of
 * 8.85 and can therefore frame 116 km of a 230 km coast — half. A wide desktop map cannot show
 * the riviera whatever it does, so this variant stops trying and commits to the other end: ONE BAY,
 * as large as the screen allows, at the scale a tourist actually chooses a sunbed at.
 *
 * <p>What the map cannot say, the chrome says instead, at the two scales above the bay: a region
 * ruler down the left edge (seven stretches, the whole 230 km, always visible) and a beach dial
 * across the top (the catalogue's own north-to-south order). Region → beach → venue, three
 * controls for the three zoom regimes the fence carves out.
 *
 * <p>The dock is the variant's second claim: what you are buying is a SET, so opening a venue
 * shows its actual beach map — the shipped `app-beach-map-canvas`, sea at the top, promenade at
 * the bottom — beside the preview card, on the discovery page.
 */
@Component({
  selector: 'app-variant-bay',
  imports: [
    RivieraMap,
    VenuePinLayer,
    VenuePreviewCard,
    BeachMapCanvas,
    BeachMapRowDef,
    CardGlass,
    PanelGlass,
    TouchTarget,
    Pane,
  ],
  host: { class: 'block' },
  templateUrl: './variant-bay.html',
})
export class VariantBay {
  protected readonly state = inject(PrototypeState);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(Pane);

  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  /** The bay in view. Nothing in the URL means Dhërmi — the coast's densest stretch. */
  protected readonly focus = computed<BeachEntry>(
    () => beachEntry(this.state.beach() ?? '') ?? beachEntry('DHERMI')!,
  );

  protected readonly region = computed<RegionCode>(() => this.focus().region);

  /** The regions that hold a venue, north to south — the ruler's seven (or fewer) stretches. */
  protected readonly regions = computed<readonly RegionEntry[]>(() => {
    const present = new Set(this.state.beaches().map((entry) => entry.region));
    return REGION_CATALOGUE.filter((entry) => present.has(entry.code));
  });

  /** The dial's beaches: every catalogue beach a fixture venue sits on, in coast order. */
  protected readonly dial = computed(() =>
    this.state.beaches().map((entry) => ({
      entry,
      count: this.state.countByBeach().get(entry.code) ?? 0,
      from: this.priceOf(entry.code),
      current: entry.code === this.focus().code,
    })),
  );

  /**
   * The ruler's seven stretches, each given the share of the column its LATITUDE span earns — so
   * the strip is a scale of the real 230 km and not seven equal boxes. Sarandë is short and
   * Himarë long, and the ruler says so.
   */
  protected readonly ruler = computed(() => {
    const counts = this.state.countByBeach();
    return this.regions().map((entry) => {
      const beaches = BEACH_CATALOGUE.filter((beach) => beach.region === entry.code);
      const lats = beaches.map((beach) => beach.view.center.lat);
      return {
        entry,
        // A one-beach region still needs a floor, or its label has nowhere to sit.
        span: Math.max(Math.max(...lats) - Math.min(...lats), 0.12),
        beaches: beaches.map((beach) => ({
          code: beach.code,
          has: (counts.get(beach.code) ?? 0) > 0,
        })),
        current: entry.code === this.region(),
      };
    });
  });

  /** The venues of the bay in view — not `focusCards()`, which is the whole coast while no
   *  beach is in the URL; this variant always has a bay, URL or no URL. */
  protected readonly venues = computed(() =>
    this.state.cards().filter((card) => card.beach === this.focus().code),
  );

  /** The venues of the bay in view; the camera is fitted to these and nothing else. */
  private readonly focusPoints = computed<readonly LngLat[]>(() => {
    const points = this.venues().flatMap((card) =>
      card.location ? [{ lng: card.location.longitude, lat: card.location.latitude }] : [],
    );
    return points.length > 0 ? points : [this.focus().view.center];
  });

  protected readonly box = signal<PaneBox | null>(null);

  /** The boot camera, derived from the measured pane — never from `RIVIERA_MAP_OPTIONS.view`. */
  protected readonly options = computed(() => {
    const box = this.box();
    return optionsFor(box ? this.bayView(box) : this.focus().view);
  });

  /** One fit, one ceiling, used by the boot camera and by every later move alike. */
  private bayView(box: PaneBox): MapView {
    // The dock floats over the bottom of the pane, so the fit only ever had the strip above it.
    const visible = { width: box.width, height: box.height - DOCK_PX };
    const fitted = fitView(this.focusPoints(), box, {
      padPx: FIT_PAD_PX,
      ceiling: zoomForCoastKm(box, BAY_KM),
      visible,
    });
    return nudged(fitted, box, box.width * SEA_SHARE, DOCK_PX / 2);
  }

  protected readonly mapHandle = computed(() => this.map()?.handle());

  /** The docked venue's sets, as the shipped beach-map canvas renders any other beach map. */
  protected readonly setRows = computed<readonly SetRow[]>(() => {
    const card = this.state.openCard();
    if (!card) {
      return [];
    }
    const perRow = 4;
    const price = card.fromPrice?.minorUnits ?? 0;
    let running = card.free;
    return ['A', 'B', 'C'].map((code, row) => {
      const tiles = Array.from({ length: perRow }, (_unused, at) => {
        const free = running > 0 && (at + row) % 3 !== 1;
        if (free) {
          running -= 1;
        }
        return { id: row * perRow + at, free };
      });
      return {
        code,
        priceLabel: row === 0 ? `€${minorUnitsToEuros(price)} front row` : null,
        zoneStart: row === 0,
        tileCount: perRow,
        tiles,
      };
    });
  });

  /** Bumped on every camera move, so the switcher's readout reports the LIVE camera — including
   *  one a hand has panned or zoomed, which is the only way to see the fence clamp for real. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle) {
        onCleanup(handle.onMove(() => this.tick.update((value) => value + 1)));
      }
    });
    // The camera follows the bay in focus; the pane never changes, so only the fit moves.
    effect(() => {
      const handle = this.mapHandle();
      const box = this.box();
      if (handle && box) {
        handle.easeTo(this.bayView(box));
      }
    });
    effect(() => {
      const box = this.pane()?.box();
      if (box) {
        this.box.set(box);
      }
    });
    // The readout over every screenshot: this pane, this camera, this much coast.
    effect(() => {
      const box = this.box();
      const handle = this.mapHandle();
      this.tick();
      if (box) {
        this.state.measurement.set({
          width: box.width,
          height: box.height,
          frame: frameOf(box, handle?.view() ?? this.options().view),
        });
      }
    });
  }

  protected priceOf(beach: BeachCode): string | null {
    const minor = this.state.fromByBeach().get(beach);
    return minor === undefined ? null : `€${minorUnitsToEuros(minor)}`;
  }

  protected chooseRegion(entry: RegionEntry): void {
    const first = this.state.beaches().find((beach) => beach.region === entry.code);
    this.state.patch({ beach: first?.code ?? null, venue: null });
  }

  protected chooseBeach(entry: BeachEntry): void {
    this.state.patch({ beach: entry.code, venue: null });
  }

  protected openVenue(id: string): void {
    this.state.patch({ venue: id });
  }

  protected narrowTo(beach: string): void {
    this.state.patch({ beach, venue: null });
  }

  protected closePreview(): void {
    this.state.patch({ venue: null });
  }
}
