/**
 * PROTOTYPE — throwaway. Variant B, "Coast spine": the map is a PORTRAIT strip, as wide as the
 * pane's height lets it be while still framing the whole coast, and the venues beside it are a
 * north→south itinerary with the beaches as stops. Scrolling the list marks where on the coast you
 * are reading; the desktop's third column shows the picked venue's sunbeds before you leave.
 */
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { BeachMapCanvas, BeachMapRowDef } from '../../shared/beach-map-canvas';
import { beachEntry } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { paneFloor, spanPx } from './coast-frame';
import { BEACH_GROUPS, BeachGroup, FIXTURE_PINS, cardsForDate, pinsOf } from './fixture';
import { ProtoPane, frame, readout } from './proto-pane';
import { ProtoState } from './proto-state';
import { revealRow } from './proto-venue-row';

/** A stand-in sunbed grid for the pick column: four rows, the front row premium, some taken. */
interface ProtoRow {
  readonly code: string;
  readonly priceLabel: string | null;
  readonly zoneStart: boolean;
  readonly tileCount: number;
  readonly tiles: readonly { readonly id: string; readonly state: 'free' | 'premium' | 'taken' }[];
}

@Component({
  selector: 'app-proto-variant-b',
  imports: [
    RouterLink,
    AmenityChip,
    BeachMapCanvas,
    BeachMapRowDef,
    CardGlass,
    FieldGlass,
    PhotoScrim,
    PhotoSlideshow,
    RivieraMap,
    SemanticChip,
    SetsFree,
    TouchTarget,
    VenuePinLayer,
    VenuePreviewCard,
    ProtoPane,
  ],
  host: { class: 'block', '(keydown.escape)': 'select(null)' },
  templateUrl: './variant-b.html',
})
export class VariantB {
  private readonly state = inject(ProtoState);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(ProtoPane);
  private readonly pinLayer = viewChild(VenuePinLayer);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  readonly frame = output<string>();

  protected readonly params = this.state.params;
  protected readonly date = computed(() => this.params().date);
  protected readonly cards = computed(() => cardsForDate(this.date()));
  protected readonly pins = computed(() => pinsOf(this.cards()));
  protected readonly groups = computed<readonly BeachGroup[]>(() => {
    const cards = this.cards();
    return BEACH_GROUPS.map((group) => ({
      ...group,
      cards: cards.filter((card) => card.beach === group.code),
    }));
  });
  protected readonly selected = computed(() => this.params().venue);
  protected readonly selectedCard = computed(
    () => this.cards().find((card) => String(card.id) === this.selected()) ?? null,
  );
  protected readonly crowdStack = computed(() => this.pinLayer()?.stack() ?? null);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly zoomed = computed(() => this.params().zoomed);
  protected readonly zoomedLabel = computed(() => beachEntry(this.zoomed())?.label ?? '');

  /** The beach the list is being read at, from the list's scroll position. */
  protected readonly reading = signal<string>(BEACH_GROUPS[0].code);
  private readonly tick = signal(0);
  /** Where the reading beach sits on the spine, in px from the pane's top; null off-screen or unbooted. */
  protected readonly readingY = computed(() => {
    this.tick();
    const handle = this.mapHandle();
    const entry = beachEntry(this.reading());
    const box = this.pane()?.box();
    if (!handle || !entry || !box) {
      return null;
    }
    const y = handle.project(entry.view.center).y;
    return y >= 0 && y <= box.height ? y : null;
  });
  protected readonly readingLabel = computed(() => beachEntry(this.reading())?.label ?? '');

  /** The spine's width: at most the widest pane that still frames the coast in the row's height, and at most a third of the window. */
  protected readonly spineWidth = computed(() => {
    const box = this.pane()?.box();
    return box && box.height > 0
      ? Math.min(spineFor(box.height), Math.round(innerWidth * 0.34))
      : 460;
  });

  protected readonly pickRows = computed<readonly ProtoRow[]>(() => {
    const card = this.selectedCard();
    if (!card) {
      return [];
    }
    const cols = Math.max(4, Math.min(8, Math.ceil(card.total / 4)));
    let taken = card.total - card.free;
    return ['A', 'B', 'C', 'D'].map((code, r) => ({
      code,
      priceLabel:
        r === 0
          ? card.priceLabel
            ? `${card.priceLabel} +€10`
            : null
          : r === 1
            ? card.priceLabel
            : null,
      zoneStart: r === 0 || r === 1,
      tileCount: cols,
      tiles: Array.from({ length: cols }, (_u, c) => {
        const isTaken = taken > 0 && (r * 7 + c * 3 + card.id) % 3 === 0;
        if (isTaken) {
          taken -= 1;
        }
        return { id: `${code}${c + 1}`, state: isTaken ? 'taken' : r === 0 ? 'premium' : 'free' };
      }),
    }));
  });

  private framed = false;

  constructor() {
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle) {
        onCleanup(handle.onMove(() => this.tick.update((n) => n + 1)));
      }
    });
    effect(() => {
      const handle = this.mapHandle();
      const box = this.pane()?.box();
      if (!handle || !box || box.width === 0) {
        return;
      }
      const points = FIXTURE_PINS.map((pin) => pin.at);
      if (!this.framed) {
        this.framed = true;
        frame(handle, points, box, 36, false);
      }
      this.frame.emit(readout(points, box, 36) + ` · spine ${Math.round(this.spineWidth())}px`);
    });
    effect(() => {
      const id = this.selected();
      if (id) {
        this.reveal(id);
      }
    });
  }

  protected isSelected(card: VenueCard): boolean {
    return this.selected() === String(card.id);
  }

  protected idOf(card: VenueCard): string {
    return String(card.id);
  }

  protected select(id: string | null): void {
    this.state.set({ venue: id });
  }

  protected onDate(event: Event): void {
    this.state.set({ date: (event.target as HTMLInputElement).value });
  }

  /** A stop's name flies the camera to the bay; the crumb on the map brings the whole coast back. */
  protected flyTo(code: string): void {
    const view = beachEntry(code)?.view;
    if (view) {
      this.mapHandle()?.easeTo(view);
      this.state.set({ zoomed: code });
    }
  }

  protected wholeCoast(): void {
    const handle = this.mapHandle();
    const box = this.pane()?.box();
    if (handle && box) {
      frame(
        handle,
        FIXTURE_PINS.map((pin) => pin.at),
        box,
        36,
        true,
      );
    }
    this.state.set({ zoomed: null });
  }

  protected onListScroll(): void {
    const list = this.list()?.nativeElement;
    if (!list) {
      return;
    }
    const top = list.getBoundingClientRect().top + 80;
    const stops = Array.from(list.querySelectorAll<HTMLElement>('[data-stop]'));
    const current =
      stops.filter((stop) => stop.getBoundingClientRect().top <= top).at(-1) ?? stops[0];
    if (current) {
      this.reading.set(current.dataset['stop']!);
    }
  }

  private reveal(id: string): void {
    afterNextRender(
      { write: () => revealRow(this.host.nativeElement, id, 'y') },
      { injector: this.injector },
    );
  }
}

/** The spine's width for a pane height: the coast's pins must fit the height, and the fence sets the floor. */
function spineFor(height: number): number {
  const points = FIXTURE_PINS.map((pin) => pin.at);
  let width = 320;
  for (let w = 320; w <= 760; w += 8) {
    const zoom = paneFloor({ width: w, height });
    if (spanPx(points, zoom).height <= height - 72) {
      width = w;
    } else {
      break;
    }
  }
  return width;
}
