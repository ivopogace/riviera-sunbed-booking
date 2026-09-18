/**
 * PROTOTYPE — throwaway. Four desktop layouts for the riviera map on Discover, on one route,
 * switched by `?variant=`:
 *
 *   A  shoreline    full-bleed two-pane, the map full height beside the list
 *   B  chart-table  the map IS the page; one glass rail floats over it
 *   C  coast-index  the coast north-to-south as the navigation instrument
 *   D  both-maps    the riviera map and the venue's own beach map on one canvas
 *
 * Route: `/prototype/map-desktop?variant=A`. Spike branch only — never merges. The design
 * question, the wireframes and the verdict are in this folder's README.md.
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
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { PROTOTYPE_VENUES } from './prototype-venues';
import { PrototypeSwitcher, PrototypeVariant } from './prototype-switcher';
import { VariantShoreline } from './variant-shoreline';
import { VariantChartTable } from './variant-chart-table';
import { VariantCoastIndex } from './variant-coast-index';
import { VariantBothMaps } from './variant-both-maps';

const VARIANTS: readonly PrototypeVariant[] = [
  {
    key: 'A',
    name: 'Shoreline',
    claim: 'Two panes, full bleed — the map finally big enough to read',
  },
  { key: 'B', name: 'Chart table', claim: 'The map is the page; the list floats over it as glass' },
  {
    key: 'C',
    name: 'Coast index',
    claim: 'The coast, north to south, as the navigation instrument',
  },
  { key: 'D', name: 'Both maps', claim: 'Coast to exact sunbed without leaving the page' },
];

@Component({
  selector: 'app-prototype-map-page',
  imports: [
    PrototypeSwitcher,
    VariantShoreline,
    VariantChartTable,
    VariantCoastIndex,
    VariantBothMaps,
  ],
  template: `
    @switch (variant()) {
      @case ('B') {
        <app-variant-chart-table [state]="state()" (filtered)="onFilter($event)" />
      }
      @case ('C') {
        <app-variant-coast-index [state]="state()" (filtered)="onFilter($event)" />
      }
      @case ('D') {
        <app-variant-both-maps [state]="state()" (filtered)="onFilter($event)" />
      }
      @default {
        <app-variant-shoreline [state]="state()" (filtered)="onFilter($event)" />
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
    const asked = (this.params().get('variant') ?? 'A').toUpperCase();
    return VARIANTS.some((v) => v.key === asked) ? asked : 'A';
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
  }));

  constructor() {
    inject(Title).setTitle('Prototype — desktop map layouts');
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
}

/** A filter change a variant asks for; absent keys are left alone. */
export interface PrototypeFilter {
  readonly beach?: string;
  readonly region?: string;
  readonly date?: string;
}

function regionOf(card: VenueCard): string {
  return REGION_BY_LABEL.get(card.regionLabel) ?? '';
}

/** The variants filter on the region CODE; the card only carries its label, so map back once. */
const REGION_BY_LABEL = new Map(
  presentRegions(PROTOTYPE_VENUES.map((v) => v.beach)).map((r) => [r.label, r.code as string]),
);
