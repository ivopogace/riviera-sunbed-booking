import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';

import { AmenityChip } from '../../shared/amenity-chip';
import { BeachEntry, REGION_CATALOGUE, RegionEntry, beachEntry } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { ClosedForSeasonChip } from '../../shared/closed-for-season-chip';
import { MapHandle } from '../../shared/map-engine';
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
  widestCoastPane,
} from './prototype-camera';
import { Pane } from './prototype-pane';
import { PrototypeState } from './prototype-state';

/** The chart keeps this much clear of its edges so Velipojë and Ksamil are not cut by the frame. */
const CHART_PAD_PX = 54;

/** One region's block in the index: the heading, then its beaches. */
interface IndexGroup {
  readonly region: RegionEntry;
  readonly rows: readonly IndexRow[];
}

interface IndexRow {
  readonly entry: BeachEntry;
  readonly count: number;
  readonly from: string | null;
  readonly freePercent: number;
  readonly current: boolean;
}

/**
 * PROTOTYPE — variant C, **Coast gazetteer**. Three columns: the index, the chart, the venues.
 *
 * <p>The measurement that shapes it: a pane frames the whole 230 km coast only while its width is
 * at most 0.80 × its height. At 1440 × 828 that caps the map column at {@link widestCoastPane}
 * ≈ 663 px — so the map is not a canvas here, it is a COLUMN, and the two columns beside it are
 * what the width is actually for. The chart never pans and never zooms of its own accord: it is a
 * printed coastal chart, drawn once, with a bracket marking the beach the index has in focus.
 *
 * <p>No hero, no selects. The 36-beach catalogue in its own north-to-south order IS the filter,
 * and it is a list of places with prices on it rather than a dropdown — which is the one thing
 * this product has that a generic search page does not.
 */
@Component({
  selector: 'app-variant-gazetteer',
  imports: [
    RivieraMap,
    VenuePinLayer,
    AmenityChip,
    CardGlass,
    ClosedForSeasonChip,
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
  templateUrl: './variant-gazetteer.html',
})
export class VariantGazetteer {
  protected readonly state = inject(PrototypeState);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(Pane);

  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  protected readonly focus = computed<BeachEntry | null>(
    () => beachEntry(this.state.beach() ?? '') ?? null,
  );

  /** The index, grouped by region so 22 rows read as seven stretches rather than one long list. */
  protected readonly groups = computed<readonly IndexGroup[]>(() => {
    const beaches = this.state.beaches();
    const counts = this.state.countByBeach();
    const focus = this.focus();
    return REGION_CATALOGUE.flatMap((region) => {
      const rows = beaches
        .filter((entry) => entry.region === region.code)
        .map((entry) => {
          const here = this.state.cards().filter((card) => card.beach === entry.code);
          const free = here.reduce((sum, card) => sum + card.free, 0);
          const total = here.reduce((sum, card) => sum + card.total, 0);
          const minor = this.state.fromByBeach().get(entry.code);
          return {
            entry,
            count: counts.get(entry.code) ?? 0,
            from: minor === undefined ? null : `€${minorUnitsToEuros(minor)}`,
            freePercent: total === 0 ? 0 : Math.round((free / total) * 100),
            current: entry.code === focus?.code,
          };
        });
      return rows.length > 0 ? [{ region, rows }] : [];
    });
  });

  /** The venues the third column shows: one beach's, or the whole coast's in catalogue order. */
  protected readonly venues = computed<readonly VenueCard[]>(() => this.state.focusCards());

  protected readonly heading = computed(() => this.focus()?.label ?? 'The whole coast');

  protected readonly box = signal<PaneBox | null>(null);

  /** The chart's one camera: every catalogued beach, fitted to the column. It does not move. */
  private readonly chartView = computed(() => {
    const box = this.box();
    return box ? fitView(COAST_POINTS, box, { padPx: CHART_PAD_PX }) : null;
  });

  protected readonly options = computed(() =>
    optionsFor(this.chartView() ?? { center: { lng: 19.75, lat: 40.6 }, zoom: 7.5 }),
  );

  protected readonly mapHandle = computed(() => this.map()?.handle());

  /** Set once a place pill has zoomed the chart in, so the way back out is offered. */
  protected readonly zoomed = signal(false);

  /** Where the focused beach sits on the chart, in px from its top — the bracket's position. */
  protected readonly bracketTop = computed<number | null>(() => {
    const handle = this.mapHandle();
    const beach = this.focus();
    this.tick();
    if (!handle || !beach) {
      return null;
    }
    return handle.project(beach.view.center).y;
  });

  private readonly tick = signal(0);

  /** The widest this column could be and still hold the coast, for the column header's readout. */
  protected readonly widestPane = computed(() => {
    const box = this.box();
    return box ? Math.round(widestCoastPane(box.height)) : null;
  });

  constructor() {
    effect(() => {
      const box = this.pane()?.box();
      if (box) {
        this.box.set(box);
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
      const handle = this.mapHandle();
      const view = this.chartView();
      this.tick();
      if (box && view) {
        this.state.measurement.set({
          width: box.width,
          height: box.height,
          frame: frameOf(box, handle?.view() ?? view),
        });
      }
    });
  }

  protected chooseBeach(row: IndexRow): void {
    this.state.patch({ beach: row.current ? null : row.entry.code, venue: null });
  }

  protected narrowTo(beach: string): void {
    this.zoomed.set(true);
    this.state.patch({ beach, venue: null });
  }

  protected openVenue(id: string): void {
    this.state.patch({ venue: id });
  }

  /** Put the chart back the way it was drawn. The only camera control the column offers. */
  protected wholeCoast(): void {
    const view = this.chartView();
    const handle: MapHandle | undefined = this.mapHandle();
    if (view && handle) {
      handle.easeTo(view);
    }
    this.zoomed.set(false);
    this.state.patch({ beach: null, venue: null });
  }
}
