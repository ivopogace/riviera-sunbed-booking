/**
 * PROTOTYPE — throwaway. Variant A, "Wide chart + shelf": the expected desktop shape — a
 * landscape map as wide as the window, a coast scrubber across its top edge because a wide pane
 * cannot frame the coast, and a shelf of compact venue rows along the bottom.
 */
import {
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
  ElementRef,
  afterNextRender,
  Injector,
} from '@angular/core';

import { BEACH_CATALOGUE, beachEntry } from '../../shared/beaches';
import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { BEACH_GROUPS, FIXTURE_PINS, cardsForDate, pinsOf } from './fixture';
import { ProtoPane, frame, readout } from './proto-pane';
import { ProtoState } from './proto-state';
import { ProtoVenueRow, revealRow } from './proto-venue-row';

@Component({
  selector: 'app-proto-variant-a',
  imports: [
    CardGlass,
    FieldGlass,
    RivieraMap,
    TouchTarget,
    VenuePinLayer,
    VenuePreviewCard,
    ProtoPane,
    ProtoVenueRow,
  ],
  host: { class: 'block', '(keydown.escape)': 'select(null)' },
  templateUrl: './variant-a.html',
})
export class VariantA {
  private readonly state = inject(ProtoState);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(ProtoPane);
  private readonly pinLayer = viewChild(VenuePinLayer);

  readonly frame = output<string>();

  protected readonly params = this.state.params;
  protected readonly date = computed(() => this.params().date);
  protected readonly beach = computed(() => this.params().beach);
  protected readonly cards = computed(() => {
    const all = cardsForDate(this.date());
    const beach = this.beach();
    return beach ? all.filter((card) => card.beach === beach) : all;
  });
  protected readonly pins = computed(() => pinsOf(this.cards()));
  protected readonly selected = computed(() => this.params().venue);
  protected readonly selectedCard = computed(
    () => this.cards().find((card) => String(card.id) === this.selected()) ?? null,
  );
  protected readonly crowdStack = computed(() => this.pinLayer()?.stack() ?? null);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly groups = BEACH_GROUPS;
  protected readonly catalogue = BEACH_CATALOGUE;

  /** Which stretch of the coast the camera covers now, as the catalogue indexes it (north to south). */
  private readonly tick = signal(0);
  protected readonly covered = computed(() => {
    this.tick();
    const handle = this.mapHandle();
    const box = this.pane()?.box();
    if (!handle || !box || box.height === 0) {
      return { from: 0, to: 0 };
    }
    const inView = BEACH_CATALOGUE.map((entry, i) => {
      const p = handle.project(entry.view.center);
      return p.x >= -40 && p.x <= box.width + 40 && p.y >= 0 && p.y <= box.height ? i : -1;
    }).filter((i) => i >= 0);
    return inView.length
      ? { from: inView[0], to: inView[inView.length - 1] }
      : { from: -1, to: -1 };
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
        frame(handle, points, box, 48, false);
      }
      this.frame.emit(readout(points, box, 48));
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

  protected goBeach(code: string): void {
    const view = beachEntry(code)?.view;
    if (view) {
      this.mapHandle()?.easeTo(view);
    }
  }

  protected onDate(event: Event): void {
    this.state.set({ date: (event.target as HTMLInputElement).value });
  }

  protected onBeachFilter(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    this.state.set({ beach: code || null, venue: null });
    const handle = this.mapHandle();
    const box = this.pane()?.box();
    if (handle && box) {
      const points = (
        code ? FIXTURE_PINS.filter((pin) => pin.card.beach === code) : FIXTURE_PINS
      ).map((pin) => pin.at);
      frame(handle, points, box, 80, true, 14);
    }
  }

  protected hasVenues(code: string): boolean {
    return BEACH_GROUPS.some((group) => group.code === code);
  }

  private reveal(id: string): void {
    afterNextRender(
      { write: () => revealRow(this.host.nativeElement, id, 'x') },
      { injector: this.injector },
    );
  }
}
