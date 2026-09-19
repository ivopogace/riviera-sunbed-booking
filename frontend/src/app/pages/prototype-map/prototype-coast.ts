/**
 * PROTOTYPE — throwaway. The coast as an index: every region and beach that has a venue, in the
 * catalogue's north-to-south order, with its count and its lowest from-price. Counted off the
 * WHOLE fixture, never the narrowed list, so the instrument's numbers do not collapse to the one
 * place already picked.
 */
import { beachesInRegion, BeachCode, REGION_CATALOGUE, RegionCode } from '../../shared/beaches';
import { VenueCard } from '../home/venue-card';
import { PROTOTYPE_VENUES } from './prototype-venues';

export interface CoastBeach {
  readonly code: BeachCode;
  readonly label: string;
  readonly venues: number;
  readonly from: string;
}

export interface CoastRegion {
  readonly code: RegionCode;
  readonly label: string;
  readonly venues: number;
  readonly from: string;
  readonly beaches: readonly CoastBeach[];
  /** The region's venues, for a camera fit or a centroid. */
  readonly cards: readonly VenueCard[];
}

function cheapest(cards: readonly VenueCard[]): string {
  const minor = Math.min(...cards.map((v) => v.fromPrice?.minorUnits ?? Infinity));
  return `€${(minor / 100).toFixed(0)}`;
}

/** The regions with venues, north to south, each with its beaches that have venues. */
export const COAST: readonly CoastRegion[] = REGION_CATALOGUE.flatMap((region) => {
  const beaches = beachesInRegion(region.code).flatMap<CoastBeach>((entry) => {
    const on = PROTOTYPE_VENUES.filter((v) => v.beach === entry.code);
    return on.length === 0
      ? []
      : [{ code: entry.code, label: entry.label, venues: on.length, from: cheapest(on) }];
  });
  const cards = PROTOTYPE_VENUES.filter((v) => beaches.some((b) => b.code === v.beach));
  return cards.length === 0
    ? []
    : [
        {
          code: region.code,
          label: region.label,
          venues: cards.length,
          from: cheapest(cards),
          beaches,
          cards,
        },
      ];
});
