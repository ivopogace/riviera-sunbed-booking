/**
 * PROTOTYPE — throwaway. Round 2's horizon band as one element the round 3 variants compose:
 * the riviera map turned so the sea lies at the foot and the coast runs left → right, fenced and
 * fitted in the rotated frame (`prototype-raw-map.ts`), with the shipped pin layer over it and the
 * shipped preview card in its corner. Round 3 takes E's orientation as settled and spends its
 * boldness on what the band CONTAINS — so the band itself is shared, and each variant projects
 * its own instrument into the `<ng-content>` slot, which sits over the sea.
 *
 * <p>`padding.bottom` is the finding from round 2 (the fit leaves the foot free for the fence's
 * push); a variant that puts an instrument in the sea asks for more, and the coast rises to make
 * room for it.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { beachEntry, RegionCode } from '../../shared/beaches';
import { LngLat } from '../../shared/map-engine';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePin } from '../home/pin-crowding';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { VenueCard } from '../home/venue-card';
import {
  COAST_BEARING,
  constrainRotated,
  fitRotated,
  rawMap,
  REGION_BEARING,
  RotatedPadding,
} from './prototype-raw-map';

/**
 * Round 3's FIRST finding: the ADR-0022 fence, widened westward into open sea. Round 2 measured
 * the whole-coast band as fence-bound at the west by ~60 px on a 414 px band, and absorbed it with
 * a deeper foot. A band deep enough to hold an instrument in the sea (H: 594 px, I: the window)
 * has a rotated footprint ~900 px wide east–west at 78°, and the same clamp then pushes the camera
 * so far east that the coast falls off the band's foot entirely (the first H/I/J shots). No
 * padding absorbs that. So the fence's west edge moves from 19.0° to 18.0°, and the whole coast
 * frames on any band. The tiles end at 19.0°; beyond them the style paints its grey background,
 * not water — a seam in the sea the screenshots show (the grey corner at the foot of I's coast
 * view). The style's background cannot simply be painted water: in OpenMapTiles styles the land
 * IS the background and water is a fill over it (tried; the whole map turned blue). The fix is
 * the extract itself growing westward — `scripts/build-riviera-map.sh`'s BBOX from 19.0 to 18.0,
 * empty sea at a few kB of tiles. This is the change the shipped `RIVIERA_MAP_OPTIONS` needs.
 */
const WIDER_FENCE: readonly [LngLat, LngLat] = [
  { lng: 18.0, lat: RIVIERA_MAP_OPTIONS.maxBounds[0].lat },
  RIVIERA_MAP_OPTIONS.maxBounds[1],
];

/** A pin at dusk: the same button, faded and desaturated, as the cards below it are. */
const DUSK_CLASSES = ['opacity-45', 'saturate-50', 'motion-safe:transition-opacity'];

/** The bearing that puts a stretch's sea at the foot: the region's own, the coast's for all of it. */
export function bearingFor(region: string, beach: string): number {
  const code = (region !== '' ? region : (beachEntry(beach)?.region ?? '')) as RegionCode | '';
  return code === '' ? COAST_BEARING : REGION_BEARING[code];
}

@Component({
  selector: 'app-prototype-band',
  imports: [RivieraMap, VenuePinLayer, VenuePreviewCard],
  host: {
    class: 'relative block overflow-hidden bg-riv-solid-btn-fill',
    '(keydown.escape)': 'open.set(null)',
  },
  template: `
    <div class="absolute inset-0 [&>app-riviera-map]:rounded-none">
      <app-riviera-map class="size-full" [nearMe]="nearMe()" (mapClick)="open.set(null)" />
    </div>
    <app-venue-pin-layer
      class="rounded-none!"
      [pins]="pins()"
      [map]="handle()"
      [selected]="litPin()"
      [maxZoom]="maxZoom"
      (chosen)="choose($event)"
      (narrowed)="narrowed.emit($event)"
    />
    <span
      class="absolute top-3 left-3 z-[6] hidden h-9 items-center gap-0.5 rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-2.5 text-[12px] font-extrabold text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.22)] lg:inline-flex"
      [attr.aria-label]="'North is ' + bearing() + ' degrees anticlockwise from up'"
      title="North"
      ><span class="text-[15px] leading-none" [style.rotate]="-bearing() + 'deg'">↑</span>N</span
    >
    <ng-content />
    @if (preview() && openCard(); as card) {
      <app-venue-preview-card
        [class]="previewClass()"
        [card]="card"
        [date]="date()"
        (closed)="open.set(null)"
      />
    }
  `,
})
export class PrototypeBand {
  readonly pins = input.required<readonly VenuePin[]>();
  /**
   * Venue ids drawn at dusk — J's venues whose sales for today have closed. Applied to the one
   * pin layer's rendered buttons by their `data-pin`, so a crowd still forms one pill (a second
   * layer per state crowded on its own and its pills overlapped the first's). A mixed crowd wears
   * its face member's state.
   */
  readonly duskIds = input<ReadonlySet<string>>(new Set());
  readonly cards = input.required<readonly VenueCard[]>();
  readonly date = input.required<string>();
  readonly bearing = input.required<number>();
  /** Room the fit keeps clear: a variant with an instrument in the sea asks for a deep foot. */
  readonly padding = input.required<RotatedPadding>();
  /** The tightest the fit goes; I's dive wants deeper than the coast's 14. */
  readonly fitMaxZoom = input(14);
  /** Plain wheel scrolls the page (a band in a scroll column) — or zooms (a map that IS the page). */
  readonly cooperative = input(true);
  readonly nearMe = input(true);
  readonly previewCorner = input<'bottom-right' | 'top-left'>('bottom-right');
  /** Draw the shipped preview card for the open venue; I draws the venue's grid instead. */
  readonly preview = input(true);
  /** A venue to open on load (`?open=`). */
  readonly initialOpen = input<string | null>(null);
  /** A card hover elsewhere on the page lights this pin. */
  readonly hovered = input<number | null>(null);
  /**
   * What the camera frames; by default every pin. A variant whose pins change without the result
   * set changing passes the stable set here so the camera stays put.
   */
  readonly fitTo = input<readonly LngLat[] | null>(null);

  readonly narrowed = output<string>();
  readonly opened = output<string | null>();

  private readonly map = viewChild(RivieraMap);
  /** The live handle, for a variant that projects its own instrument through the same camera. */
  readonly handle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly open = signal<string | null>(null);
  /** Bumped on every camera move: the pin layer re-renders its buttons on the same signal. */
  private readonly moved = signal(0);
  protected readonly previewClass = computed(() =>
    this.previewCorner() === 'top-left'
      ? 'absolute top-14 left-3 z-[7] w-[min(380px,calc(100%-24px))]'
      : 'absolute top-3 left-3 z-[7] w-[min(380px,calc(100%-24px))] lg:top-auto lg:bottom-3 lg:left-auto lg:right-3',
  );
  protected readonly litPin = computed(() => {
    const hover = this.hovered();
    return this.open() ?? (hover === null ? null : String(hover));
  });
  protected readonly openCard = computed<VenueCard | null>(() => {
    const id = this.open();
    return id === null ? null : (this.cards().find((c) => String(c.id) === id) ?? null);
  });

  /** Where a point lands on the band right now; `null` before the engine is up. */
  project(at: LngLat): { x: number; y: number } | null {
    const handle = this.handle();
    return handle === undefined ? null : handle.project(at);
  }

  /** Ease the camera to `at` at `zoom`, turned to `bearing` (the band's own unless given). */
  flyTo(at: LngLat, zoom: number, bearing = this.bearing()): void {
    const handle = this.handle();
    const raw = handle && rawMap(handle);
    raw?.map.easeTo({ center: [at.lng, at.lat], zoom, bearing, duration: 900 });
  }

  protected choose(id: string): void {
    this.open.set(id);
    this.opened.emit(id);
  }

  constructor() {
    afterRenderEffect(() => {
      const dusk = this.duskIds();
      this.pins();
      this.handle();
      this.moved();
      for (const button of this.element.nativeElement.querySelectorAll<HTMLElement>('[data-pin]')) {
        const at = dusk.has(button.dataset['pin'] ?? '');
        for (const cls of DUSK_CLASSES) button.classList.toggle(cls, at);
      }
    });
    effect(() => {
      const asked = this.initialOpen();
      if (asked !== null) this.open.set(asked);
    });
    let fenced = false;
    effect(() => {
      const handle = this.handle();
      const pins = this.fitTo() ?? this.pins().map((p) => p.at);
      // A new result set is refitted at whatever bearing the band wears; a bearing change on its
      // own (I turning to an opened venue's stretch) is the variant's move, not a refit.
      const bearing = untracked(() => this.bearing());
      const padding = this.padding();
      const maxZoom = this.fitMaxZoom();
      if (handle === undefined) return;
      const raw = rawMap(handle);
      if (raw === null) return;
      if (!fenced) {
        constrainRotated(raw, WIDER_FENCE, () => this.bearing());
        handle.onMove(() => this.moved.update((n) => n + 1));
        if (this.cooperative()) raw.map.cooperativeGestures.enable();
        fenced = true;
      }
      const wide = this.element.nativeElement.clientWidth >= 1024;
      fitRotated(
        raw,
        pins,
        bearing,
        wide ? padding : { top: 28, bottom: Math.min(padding.bottom, 48), left: 64, right: 130 },
        maxZoom,
      );
    });
  }
}
