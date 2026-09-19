/**
 * PROTOTYPE — throwaway. The riviera map on Discover, phone first: round 6's **Q** (Shore) on one
 * route. Sixteen other layouts (A–P) were built across six rounds and cut; the README's
 * § *Tried and cut* says what each proved and why it went, and their code is recoverable from
 * this branch's history.
 *
 * Route: `/prototype/map`. Spike branch only — never merges. The design question, the research,
 * the wireframes and the verdicts are in this folder's README.md.
 *
 * <p>The host owns only what the variant needs (the fixture cards, the beach/region/date filters,
 * the tourist's position), seeded from the URL so any state is shareable and screenshot-able.
 */
import { Component, computed, linkedSignal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { defaultBookingDate, formatCivilDate } from '../../shared/booking-date';
import { presentBeaches, presentRegions } from '../../shared/beaches';
import { LngLat } from '../../shared/map-engine';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { parseHere } from './prototype-place';
import { PROTOTYPE_VENUES } from './prototype-venues';
import { VariantShore } from './variant-shore';

@Component({
  selector: 'app-prototype-map-page',
  imports: [VariantShore],
  template: `<app-variant-shore [state]="state()" (filtered)="onFilter($event)" />`,
})
export class PrototypeMapPage {
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  /**
   * Seeded from the URL so any state is shareable and screenshot-able: `?region=HIMARE`,
   * `?beach=DHERMI&date=2026-09-20`. A control then owns the signal.
   */
  private readonly beach = linkedSignal(() => this.params().get('beach') ?? '');
  private readonly region = linkedSignal(() => this.params().get('region') ?? '');
  private readonly date = linkedSignal(
    () => this.params().get('date') ?? defaultBookingDate(new Date()),
  );
  /** Where the tourist is (`?here=lng,lat`), or `null` until Near me is pressed and granted. */
  private readonly here = linkedSignal(() => parseHere(this.params().get('here')));

  private readonly cards = computed<readonly VenueCard[]>(() => {
    const beach = this.beach();
    const region = this.region();
    return PROTOTYPE_VENUES.filter(
      (card) =>
        (beach === '' || card.beach === beach) && (region === '' || regionOf(card) === region),
    );
  });

  protected readonly state = computed<PrototypeState>(() => ({
    cards: this.cards(),
    pins: this.cards().flatMap((card) =>
      card.location
        ? [
            {
              id: String(card.id),
              at: { lng: card.location.longitude, lat: card.location.latitude },
              card,
            },
          ]
        : [],
    ),
    beaches: presentBeaches(PROTOTYPE_VENUES.map((v) => v.beach)),
    regions: presentRegions(PROTOTYPE_VENUES.map((v) => v.beach)),
    beach: this.beach(),
    region: this.region(),
    date: this.date(),
    dateLabel: formatCivilDate(this.date()),
    here: this.here(),
  }));

  constructor() {
    inject(Title).setTitle('Prototype — riviera map layouts');
  }

  protected onFilter(change: PrototypeFilter): void {
    if (change.beach !== undefined) {
      this.beach.set(change.beach);
      // Choosing a beach clears a region that would contradict it — the real page does the same.
      if (change.beach !== '') this.region.set('');
    }
    if (change.region !== undefined) {
      this.region.set(change.region);
      if (change.region !== '') this.beach.set('');
    }
    if (change.date !== undefined) this.date.set(change.date);
    if (change.here !== undefined) this.here.set(change.here);
  }
}

/** What every variant is handed. A variant reads this and owns everything else. */
export interface PrototypeState {
  readonly cards: readonly VenueCard[];
  readonly pins: readonly VenuePin[];
  readonly beaches: ReturnType<typeof presentBeaches>;
  readonly regions: ReturnType<typeof presentRegions>;
  readonly beach: string;
  readonly region: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly here: LngLat | null;
}

/** A filter change a variant asks for; absent keys are left alone. */
export interface PrototypeFilter {
  readonly beach?: string;
  readonly region?: string;
  readonly date?: string;
  readonly here?: LngLat | null;
}

function regionOf(card: VenueCard): string {
  return REGION_BY_LABEL.get(card.regionLabel) ?? '';
}

/** The variants filter on the region CODE; the card only carries its label, so map back once. */
const REGION_BY_LABEL = new Map(
  presentRegions(PROTOTYPE_VENUES.map((v) => v.beach)).map((r) => [r.label, r.code as string]),
);
