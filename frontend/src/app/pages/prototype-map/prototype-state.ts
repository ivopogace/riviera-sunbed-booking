import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

import { BEACH_CATALOGUE, BeachCode, BeachEntry, beachEntry } from '../../shared/beaches';
import { defaultBookingDate, isIsoDate } from '../../shared/booking-date';
import { formatBookingDate } from '../../shared/booking-date-label';
import { VenuePin } from '../home/pin-crowding';
import { VenueCard } from '../home/venue-card';
import { Frame } from './prototype-camera';
import { FIXTURE_VENUES, pinsOf, toCard } from './prototype-fixture';

/** PROTOTYPE. The four candidate answers, keyed by the `?variant=` letter. */
export type Variant = 'a' | 'b' | 'c' | 'd';
export const VARIANTS: readonly Variant[] = ['a', 'b', 'c', 'd'];
export const VARIANT_NAMES: Readonly<Record<Variant, string>> = {
  a: 'Bay theatre',
  b: 'Drive south',
  c: 'Coast gazetteer',
  d: 'Thumb coast',
};

/** A mounted variant's pane and what its camera currently frames. */
export interface Measurement {
  readonly width: number;
  readonly height: number;
  readonly frame: Frame;
}

/** How far the mobile-first variant's venue sheet is drawn up. */
export type SheetStep = 'peek' | 'half' | 'full';
const SHEET_STEPS: readonly SheetStep[] = ['peek', 'half', 'full'];

/**
 * PROTOTYPE. Every piece of state the four variants share, read from and written back to the URL
 * so any screen in the spike is a link: `?variant=c&beach=DHERMI&venue=12&date=2026-07-14`.
 * Page-scoped (provided by the route component), never a `core/` singleton.
 */
@Injectable()
export class PrototypeState {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params: Signal<ParamMap> = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly variant = computed<Variant>(() => {
    const raw = this.params().get('variant');
    return VARIANTS.find((letter) => letter === raw) ?? 'a';
  });

  readonly date = computed(() => {
    const raw = this.params().get('date');
    return raw && isIsoDate(raw) ? raw : defaultBookingDate(new Date());
  });

  readonly dateLabel = computed(() => formatBookingDate(this.date()));

  /** The beach in focus, or `null` for the whole coast. */
  readonly beach = computed<BeachCode | null>(() => {
    const raw = this.params().get('beach') ?? '';
    return beachEntry(raw)?.code ?? null;
  });

  /** The venue whose preview is open, as its fixture id, or `null`. */
  readonly venue = computed<number | null>(() => {
    const raw = Number(this.params().get('venue'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });

  /** Variant B's travel position: 0 at the northern end of the coast, 1 at Ksamil. */
  readonly progress = computed(() => {
    const raw = Number(this.params().get('at'));
    return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0;
  });

  /** Variant D only: the thumb has zoomed the map into the bay it had in focus. */
  readonly bay = computed(() => this.params().get('bay') === '1');

  readonly sheet = computed<SheetStep>(() => {
    const raw = this.params().get('sheet');
    return SHEET_STEPS.find((step) => step === raw) ?? 'peek';
  });

  /** Every fixture venue as the card the list, the pins and the preview all read. */
  readonly cards = computed<readonly VenueCard[]>(() => {
    const label = this.dateLabel();
    return FIXTURE_VENUES.map((venue) => toCard(venue, label));
  });

  readonly pins = computed<readonly VenuePin[]>(() => pinsOf(this.cards()));

  /** The catalogue beaches a fixture venue actually sits on, north to south. */
  readonly beaches = computed<readonly BeachEntry[]>(() => {
    const present = new Set(this.cards().map((card) => card.beach));
    return BEACH_CATALOGUE.filter((entry) => present.has(entry.code));
  });

  /** The cards on one beach, in catalogue order; every card when nothing is in focus. */
  readonly focusCards = computed<readonly VenueCard[]>(() => {
    const beach = this.beach();
    return beach === null ? this.cards() : this.cards().filter((card) => card.beach === beach);
  });

  readonly openCard = computed<VenueCard | null>(() => {
    const id = this.venue();
    return id === null ? null : (this.cards().find((card) => card.id === id) ?? null);
  });

  /** How many venues sit on each beach, for the index rails. */
  readonly countByBeach = computed<ReadonlyMap<BeachCode, number>>(() => {
    const counts = new Map<BeachCode, number>();
    for (const card of this.cards()) {
      counts.set(card.beach, (counts.get(card.beach) ?? 0) + 1);
    }
    return counts;
  });

  /** The cheapest from-price on each beach, in minor units — the index rail's second line. */
  readonly fromByBeach = computed<ReadonlyMap<BeachCode, number>>(() => {
    const lowest = new Map<BeachCode, number>();
    for (const card of this.cards()) {
      const price = card.fromPrice?.minorUnits;
      if (price !== undefined && price < (lowest.get(card.beach) ?? Number.POSITIVE_INFINITY)) {
        lowest.set(card.beach, price);
      }
    }
    return lowest;
  });

  /**
   * What the mounted variant's map pane measured, for the switcher's readout: every screenshot
   * then carries the evidence for the argument made about it.
   */
  readonly measurement = signal<Measurement | null>(null);

  /** Merge state into the URL. Every variant mutates through here, so nothing is unlinkable. */
  patch(values: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: values,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
