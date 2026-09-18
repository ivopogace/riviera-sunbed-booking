import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { BeachEntry, regionLabel } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { LngLat } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { VenuePinLayer } from '../home/venue-pin-layer';
import {
  between,
  COAST_KM,
  frameOf,
  optionsFor,
  PaneBox,
  viewAt,
  zoomForCoastKm,
} from './prototype-camera';
import { Pane } from './prototype-pane';
import { PrototypeState } from './prototype-state';

/** How much coast is in shot while travelling: a bay and the headlands either side of it. */
const TRAVEL_KM = 13;
/** One stop on the drive: a beach, its venues, and how far south of Velipojë it sits. */
interface Stop {
  readonly entry: BeachEntry;
  readonly regionLabel: string;
  readonly km: number;
  readonly cards: readonly VenueCard[];
}

/**
 * PROTOTYPE — variant B, **Drive south**. The coast is a 230 km road with the sea on one side,
 * and the tourist is already on it. So the page does not ask where you want to go: it drives.
 *
 * <p>Scrolling the venue rail moves the CAMERA, continuously, from Velipojë to Ksamil. Nothing is
 * hijacked — the rail is an ordinary scroller with an ordinary scrollbar, keyboard paging and all;
 * the map simply follows the place the reader has reached, interpolating between one beach's
 * centre and the next. The zoom is derived from the pane so that {@link TRAVEL_KM} of coast is in
 * shot whatever the window: at 1440 the fence is nowhere near binding at this scale, which is
 * exactly why a travelling camera can be wide when a static one cannot.
 *
 * <p>The odometer down the middle is the thing a map at this zoom can never show: where these
 * 13 km sit in the whole 230. The URL carries `?at=` so any point on the drive is a link.
 */
@Component({
  selector: 'app-variant-drive',
  imports: [
    RivieraMap,
    VenuePinLayer,
    CardGlass,
    PanelGlass,
    PhotoScrim,
    PhotoSlideshow,
    SemanticChip,
    SetsFree,
    TouchTarget,
    Pane,
  ],
  host: { class: 'block' },
  templateUrl: './variant-drive.html',
})
export class VariantDrive {
  protected readonly state = inject(PrototypeState);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(Pane);
  private readonly rail = viewChild.required<ElementRef<HTMLElement>>('rail');

  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly coastKm = Math.round(COAST_KM);

  /** Every beach with a venue, north to south, each tagged with its distance down the coast. */
  protected readonly stops = computed<readonly Stop[]>(() => {
    const beaches = this.state.beaches();
    const north = beaches[0]?.view.center.lat ?? 0;
    return beaches.map((entry) => ({
      entry,
      regionLabel: regionLabel(entry.region),
      km: Math.round((north - entry.view.center.lat) * 111.32),
      cards: this.state.cards().filter((card) => card.beach === entry.code),
    }));
  });

  protected readonly box = signal<PaneBox | null>(null);
  /** Where the drive has reached, 0 at Velipojë and 1 at Ksamil. Written by the rail's scroll. */
  private readonly at = signal(0);

  /** The camera's position on the coastline polyline, interpolated between two beach centres. */
  private readonly position = computed<LngLat>(() => {
    const stops = this.stops();
    const span = stops.length - 1;
    const travelled = this.at() * span;
    const index = Math.min(Math.floor(travelled), span - 1);
    return between(
      stops[index].entry.view.center,
      stops[index + 1].entry.view.center,
      travelled - index,
    );
  });

  /** Which stop the reader has arrived at — the one whose venues are on screen right now. */
  protected readonly current = computed<Stop>(() => {
    const stops = this.stops();
    return stops[Math.min(Math.round(this.at() * (stops.length - 1)), stops.length - 1)];
  });

  protected readonly travelledKm = computed(() => Math.round(this.at() * COAST_KM));

  private readonly travelView = computed(() => {
    const box = this.box();
    return box ? viewAt(this.position(), zoomForCoastKm(box, TRAVEL_KM), box) : null;
  });

  protected readonly options = computed(() =>
    optionsFor(this.travelView() ?? this.stops()[0].entry.view),
  );

  protected readonly mapHandle = computed(() => this.map()?.handle());

  private urlTimer: ReturnType<typeof setTimeout> | undefined;

  /** Bumped on every camera move, so the readout reports the LIVE camera and not the target. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle) {
        onCleanup(handle.onMove(() => this.tick.update((value) => value + 1)));
      }
    });
    effect(() => {
      const box = this.pane()?.box();
      if (box) {
        this.box.set(box);
      }
    });
    // The travel itself: a cut per frame, never an ease — an ease would fight the wheel.
    effect(() => {
      const handle = this.mapHandle();
      const view = this.travelView();
      if (handle && view) {
        handle.setView(view);
      }
    });
    effect(() => {
      const box = this.box();
      const handle = this.mapHandle();
      const view = this.travelView();
      this.tick();
      if (box && view) {
        this.state.measurement.set({
          width: box.width,
          height: box.height,
          frame: frameOf(box, handle?.view() ?? view),
        });
      }
    });
    afterNextRender(() => this.seekFromUrl());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.urlTimer));
  }

  /** The rail's scroll, read straight off the element: the reader's position IS the camera's. */
  protected onRailScroll(): void {
    const element = this.rail().nativeElement;
    const travel = element.scrollHeight - element.clientHeight;
    this.at.set(travel > 0 ? Math.min(Math.max(element.scrollTop / travel, 0), 1) : 0);
    clearTimeout(this.urlTimer);
    // Debounced: the URL should carry where the drive stopped, not every frame of it.
    this.urlTimer = setTimeout(() => this.state.patch({ at: this.at().toFixed(3) }), 400);
  }

  /**
   * A pin press marks its venue and brings its row to the top of the rail — which, since the rail
   * IS the camera, also drives there. There is no preview card in this variant on purpose: the
   * rail already carries every fact a preview would repeat.
   */
  protected openVenue(id: string): void {
    this.state.patch({ venue: id });
    this.rail()
      .nativeElement.querySelector(`[data-row="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected isCurrent(stop: Stop): boolean {
    return stop.entry.code === this.current().entry.code;
  }

  private seekFromUrl(): void {
    const element = this.rail().nativeElement;
    const travel = element.scrollHeight - element.clientHeight;
    element.scrollTop = this.state.progress() * travel;
    this.onRailScroll();
  }
}
