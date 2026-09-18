import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';

import { AmenityChip } from '../../shared/amenity-chip';
import { BeachEntry, beachEntry } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { LngLat } from '../../shared/map-engine';
import { minorUnitsToEuros } from '../../shared/money';
import { PanelGlass } from '../../shared/panel-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { SalesClosedChip } from '../../shared/sales-closed-chip';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { VenuePinLayer } from '../home/venue-pin-layer';
import {
  COAST_POINTS,
  fitView,
  frameOf,
  optionsFor,
  PaneBox,
  nudged,
  zoomForCoastKm,
} from './prototype-camera';
import { Pane } from './prototype-pane';
import { PrototypeState, SheetStep } from './prototype-state';

/** The coast chart keeps its ends clear of the sheet's lip and the header's glass. */
const CHART_PAD_PX = 34;
/** A bay is fitted with more air: the pins are pills, not dots, and they must not touch an edge. */
const BAY_PAD_PX = 76;
/** The bay camera's floor, as coast rather than as a zoom number, and its seaward bias. */
const BAY_KM = 2.4;
const SEA_SHARE = 0.12;

/** How much of the phone's map each sheet step floats over — the fit gets what is left. */
const SHEET_PX: Readonly<Record<SheetStep, number>> = { peek: 244, half: 390, full: 560 };

/** How many venues each sheet step shows. `full` shows the beach's whole list. */
const STEP_COUNT: Readonly<Record<SheetStep, number>> = { peek: 1, half: 3, full: 99 };
const STEP_ORDER: readonly SheetStep[] = ['peek', 'half', 'full'];

/**
 * PROTOTYPE — variant D, **Thumb coast**. Designed at 390 × 844 first, then grown.
 *
 * <p>The measurement that makes it mobile-FIRST rather than mobile-too: a pane frames the whole
 * catalogued coast only while its width is at most 0.80 × its height, so the phone is the ONLY
 * device in this spike whose map can hold all 230 km — 390 × 560 frames it with room to spare,
 * while 1440 × 828 cannot come close. The phone therefore gets the thing the desktop is denied,
 * and the shipped List/Map toggle goes: there is no screen here without both a map and a venue.
 *
 * <p>The control is a **coast scrubber** down the right edge, under the thumb — one tall slider,
 * 56 px wide, with a notch per catalogued beach in the catalogue's own north-to-south order.
 * Dragging it moves the focus along the coast while the chart stays whole; pressing the beach
 * pill it carries drops into that bay. The venue sheet below steps peek → half → full, and every
 * step is in the URL.
 *
 * <p>Grown up (≥ lg) the same three parts re-arrange rather than reflow: the scrubber becomes a
 * labelled rail, the map takes the middle, and the sheet becomes a column whose three steps turn
 * into density — one pick, three, or the lot.
 */
@Component({
  selector: 'app-variant-thumb',
  imports: [
    RivieraMap,
    VenuePinLayer,
    AmenityChip,
    CardGlass,
    PanelGlass,
    PhotoScrim,
    PhotoSlideshow,
    SalesClosedChip,
    SemanticChip,
    SetsFree,
    TouchTarget,
    Pane,
  ],
  host: { class: 'block' },
  templateUrl: './variant-thumb.html',
})
export class VariantThumb {
  protected readonly state = inject(PrototypeState);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(Pane);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  /** Every beach with a venue, north to south — the scrubber's notches and the rail's rows. */
  protected readonly stops = computed<readonly BeachEntry[]>(() => this.state.beaches());

  protected readonly index = computed(() => {
    const beach = this.state.beach();
    const at = this.stops().findIndex((entry) => entry.code === beach);
    return at >= 0 ? at : 0;
  });

  protected readonly focus = computed<BeachEntry>(
    () => beachEntry(this.state.beach() ?? '') ?? this.stops()[this.index()],
  );

  protected readonly here = computed<readonly VenueCard[]>(() =>
    this.state.cards().filter((card) => card.beach === this.focus().code),
  );

  /** What the sheet actually shows at its current step: the freest venues first — the thumb's pick. */
  protected readonly shown = computed<readonly VenueCard[]>(() =>
    [...this.here()]
      .sort((left, right) => right.freePercent - left.freePercent)
      .slice(0, STEP_COUNT[this.state.sheet()]),
  );

  protected readonly fromHere = computed(() => {
    const minor = this.state.fromByBeach().get(this.focus().code);
    return minor === undefined ? null : `€${minorUnitsToEuros(minor)}`;
  });

  protected readonly box = signal<PaneBox | null>(null);

  /** True once the layout is the grown-up one, where the sheet stops floating over the map. */
  private readonly wide = computed(() => (this.box()?.width ?? 0) >= 560);

  /** The scrubber stops where the sheet starts, so no notch is ever drawn under it. */
  protected readonly scrubberBottom = computed(() => SHEET_PX[this.state.sheet()] - 12);

  private readonly bayPoints = computed<readonly LngLat[]>(() => {
    const points = this.here().flatMap((card) =>
      card.location ? [{ lng: card.location.longitude, lat: card.location.latitude }] : [],
    );
    return points.length > 0 ? points : [this.focus().view.center];
  });

  private readonly view = computed(() => {
    const box = this.box();
    if (!box) {
      return null;
    }
    // Below `lg` the sheet floats over the map; from `lg` it is a column beside it and covers none.
    const covered = this.wide() ? 0 : SHEET_PX[this.state.sheet()];
    const visible = { width: box.width, height: Math.max(box.height - covered, 160) };
    if (!this.state.bay()) {
      // The whole-coast chart is what the phone is FOR, so it keeps the whole pane and simply
      // accepts that the sheet hides the southern end until the thumb pushes the sheet back down.
      return fitView(COAST_POINTS, box, { padPx: CHART_PAD_PX });
    }
    const fitted = fitView(this.bayPoints(), box, {
      padPx: BAY_PAD_PX,
      ceiling: zoomForCoastKm(box, BAY_KM),
      visible,
    });
    return nudged(fitted, box, box.width * SEA_SHARE, covered / 2);
  });

  protected readonly options = computed(() =>
    optionsFor(this.view() ?? { center: { lng: 19.75, lat: 40.6 }, zoom: 7.2 }),
  );

  protected readonly mapHandle = computed(() => this.map()?.handle());

  /** Where the focus sits on the chart, so the scrubber's thumb and the map agree. */
  protected readonly focusTop = computed<number | null>(() => {
    const handle = this.mapHandle();
    this.tick();
    return handle ? handle.project(this.focus().view.center).y : null;
  });

  private readonly tick = signal(0);

  constructor() {
    effect(() => {
      const box = this.pane()?.box();
      if (box) {
        this.box.set(box);
      }
    });
    effect(() => {
      const handle = this.mapHandle();
      const view = this.view();
      if (handle && view) {
        handle.easeTo(view);
      }
    });
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle) {
        onCleanup(handle.onMove(() => this.tick.update((value) => value + 1)));
      }
    });
    effect(() => {
      const box = this.box();
      const view = this.view();
      if (box && view) {
        this.state.measurement.set({
          width: box.width,
          height: box.height,
          frame: frameOf(box, view),
        });
      }
    });
  }

  /** The scrubber's position as a percentage of its track, for the thumb and the current label. */
  protected readonly thumbPercent = computed(() => {
    const span = Math.max(this.stops().length - 1, 1);
    return (this.index() / span) * 100;
  });

  protected notchPercent(at: number): number {
    return (at / Math.max(this.stops().length - 1, 1)) * 100;
  }

  protected onScrub(event: PointerEvent): void {
    if (event.type === 'pointermove' && event.buttons === 0) {
      return;
    }
    const rect = this.track().nativeElement.getBoundingClientRect();
    const fraction = (event.clientY - rect.top) / Math.max(rect.height, 1);
    const span = this.stops().length - 1;
    const at = Math.round(Math.min(Math.max(fraction, 0), 1) * span);
    this.moveTo(at);
  }

  protected onScrubKey(event: Event, delta: number): void {
    event.preventDefault();
    this.moveTo(this.index() + delta);
  }

  private moveTo(at: number): void {
    const clamped = Math.min(Math.max(at, 0), this.stops().length - 1);
    const entry = this.stops()[clamped];
    if (entry.code !== this.focus().code) {
      this.state.patch({ beach: entry.code, venue: null });
    }
  }

  protected stepSheet(): void {
    const at = STEP_ORDER.indexOf(this.state.sheet());
    this.state.patch({ sheet: STEP_ORDER[(at + 1) % STEP_ORDER.length] });
  }

  protected setStep(step: SheetStep): void {
    this.state.patch({ sheet: step });
  }

  protected toggleBay(): void {
    this.state.patch({ bay: this.state.bay() ? null : '1' });
  }

  protected openVenue(id: string): void {
    this.state.patch({ venue: id, sheet: 'half' });
  }

  protected narrowTo(beach: string): void {
    this.state.patch({ beach, venue: null, bay: '1' });
  }

  protected sheetClass(): string {
    switch (this.state.sheet()) {
      case 'peek':
        return 'h-[244px] lg:h-auto';
      case 'half':
        return 'h-[390px] lg:h-auto';
      default:
        return 'h-[560px] lg:h-auto';
    }
  }
}
