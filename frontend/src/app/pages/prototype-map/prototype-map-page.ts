/**
 * PROTOTYPE — throwaway. The layouts for the riviera map on Discover that survived rounds 1–6,
 * on one route, switched by `?variant=`:
 *
 *   Q  shore        round 6, from the research: the map is the ground, the list a three-height
 *                   sheet over it, the first screen's map a still poster with live pins
 *   P  search       round 5, the Airbnb pattern from memory — kept as the control Q is judged
 *                   against: list first, a Map pill, a map screen with a carousel
 *
 * Fifteen others (A–O) were built and cut; the README's § *Tried and cut* says what each proved
 * and why it went, and their code is recoverable from this branch's history.
 *
 * Route: `/prototype/map?variant=N`. Spike branch only — never merges. The design question, the
 * wireframes and the verdicts are in this folder's README.md.
 *
 * <p>The host owns only what every variant needs (the fixture cards, the beach/region/date
 * filters, which pin is open) so a variant is free to throw out the whole layout — including the
 * hero and where the map goes. No shared layout component, on purpose.
 */
import { Component, computed, linkedSignal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { defaultBookingDate, formatCivilDate } from '../../shared/booking-date';
import { presentBeaches, presentRegions } from '../../shared/beaches';
import { LngLat } from '../../shared/map-engine';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { parseHere } from './prototype-place';
import { PROTOTYPE_VENUES } from './prototype-venues';
import { PrototypeSwitcher, PrototypeVariant } from './prototype-switcher';
import { VariantSearch } from './variant-search';
import { VariantShore } from './variant-shore';

const VARIANTS: readonly PrototypeVariant[] = [
  {
    key: 'Q',
    name: 'Shore',
    claim:
      'Round 6 — the map is the ground, the list a sheet with three heights, the first map a poster',
  },
  {
    key: 'P',
    name: 'Search',
    claim: 'Round 5 — the Airbnb pattern: list first, a Map pill, a full-bleed map with a carousel',
  },
];

@Component({
  selector: 'app-prototype-map-page',
  imports: [PrototypeSwitcher, VariantSearch, VariantShore],
  template: `
    @switch (variant()) {
      @case ('P') {
        <app-variant-search [state]="state()" (filtered)="onFilter($event)" />
      }
      @default {
        <app-variant-shore [state]="state()" (filtered)="onFilter($event)" />
      }
    }
    <app-prototype-switcher [variants]="variants" [currentKey]="variant()" (picked)="go($event)" />
  `,
})
export class PrototypeMapPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly variants = VARIANTS;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly variant = computed(() => {
    const asked = (this.params().get('variant') ?? 'Q').toUpperCase();
    return VARIANTS.some((v) => v.key === asked) ? asked : 'Q';
  });

  /**
   * Seeded from the URL so any state is shareable and screenshot-able:
   * `?variant=C&region=HIMARE`, `?variant=D&open=22`. A control then owns the signal.
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

  protected go(key: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
