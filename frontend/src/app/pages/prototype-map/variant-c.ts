/**
 * PROTOTYPE — throwaway. Variant C, "Bay by bay": the map never tries to be the whole coast. The
 * coast is a text rail of the 36 beaches, north→south; the map shows one bay at the scale where
 * its pins separate; the bay's venues sit beside it as full cards. Walk the coast bay by bay.
 */
import { Component, computed, effect, inject, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { BEACH_CATALOGUE, REGION_CATALOGUE, beachEntry } from '../../shared/beaches';
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
import { BEACH_GROUPS, cardsForDate, pinsOf } from './fixture';
import { ProtoPane, frame, readout } from './proto-pane';
import { ProtoState } from './proto-state';

/** A bay is framed no closer than this: the beach and its neighbours' water, not one pin's roof. */
const BAY_MAX_ZOOM = 14;

@Component({
  selector: 'app-proto-variant-c',
  imports: [
    RouterLink,
    AmenityChip,
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
  templateUrl: './variant-c.html',
})
export class VariantC {
  private readonly state = inject(ProtoState);
  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild(ProtoPane);
  private readonly pinLayer = viewChild(VenuePinLayer);

  readonly frame = output<string>();

  protected readonly params = this.state.params;
  protected readonly date = computed(() => this.params().date);
  protected readonly bay = computed(() =>
    BEACH_GROUPS.some((g) => g.code === this.params().bay) ? this.params().bay : 'DHERMI',
  );
  protected readonly bayEntry = computed(() => beachEntry(this.bay())!);
  protected readonly cards = computed(() =>
    cardsForDate(this.date()).filter((card) => card.beach === this.bay()),
  );
  protected readonly pins = computed(() => pinsOf(this.cards()));
  protected readonly selected = computed(() => this.params().venue);
  protected readonly selectedCard = computed(
    () => this.cards().find((card) => String(card.id) === this.selected()) ?? null,
  );
  protected readonly crowdStack = computed(() => this.pinLayer()?.stack() ?? null);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly regions = REGION_CATALOGUE.map((region) => ({
    ...region,
    beaches: BEACH_CATALOGUE.filter((entry) => entry.region === region.code).map((entry) => ({
      ...entry,
      group: BEACH_GROUPS.find((group) => group.code === entry.code) ?? null,
    })),
  }));
  protected readonly bayIndex = computed(() =>
    BEACH_GROUPS.findIndex((group) => group.code === this.bay()),
  );
  protected readonly prevBay = computed(() => BEACH_GROUPS[this.bayIndex() - 1] ?? null);
  protected readonly nextBay = computed(() => BEACH_GROUPS[this.bayIndex() + 1] ?? null);

  private framedBay = '';

  constructor() {
    effect(() => {
      const handle = this.mapHandle();
      const box = this.pane()?.box();
      const bay = this.bay();
      const points = this.pins().map((pin) => pin.at);
      if (!handle || !box || box.width === 0 || points.length === 0) {
        return;
      }
      if (this.framedBay !== bay) {
        frame(handle, points, box, 96, this.framedBay !== '', BAY_MAX_ZOOM);
        this.framedBay = bay;
      }
      this.frame.emit(readout(points, box, 96) + ' (this bay only; ceiling z14)');
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

  protected goBay(code: string): void {
    this.state.set({ bay: code, venue: null });
  }

  protected onDate(event: Event): void {
    this.state.set({ date: (event.target as HTMLInputElement).value });
  }
}
