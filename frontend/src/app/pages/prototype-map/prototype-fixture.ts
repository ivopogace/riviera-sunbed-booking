import {
  Amenity,
  amenityLabel,
  distanceToWaterLabel,
  orderedAmenities,
} from '../../shared/amenities';
import { BeachCode, beachEntry, beachLabel, regionLabel } from '../../shared/beaches';
import { LngLat } from '../../shared/map-engine';
import { apiPhotoUrl } from '../../shared/photo-url';
import { formatMoney } from '../../shared/money';
import { isRated, ratingScore, reviewsLabel } from '../../shared/rating';
import { PhotoView, VenueSummary } from '../../shared/venue-views';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';

/**
 * PROTOTYPE. Twenty-eight venues strung along the real coast, so the spike runs on `npm start`
 * with no backend. Positions are the catalogue beach's own centre nudged by a few hundred metres,
 * which is what makes the pin crowding real: Drymades and Dhërmi are 1.4 km apart and bury each
 * other at every zoom a desktop pane can hold, exactly as the shipped data does.
 *
 * <p>Photos are three stand-in paths per venue, answered by `tiles.mjs` with generated SVGs —
 * the point is how much photo MASS a layout carries, never what is in the picture.
 */

/** One fixture row before it is grown into the shipped {@link VenueSummary} shape. */
interface Seed {
  readonly name: string;
  readonly beach: BeachCode;
  /** Metres east and north of the beach's catalogue centre, so venues on one beach separate. */
  readonly offset: readonly [number, number];
  /** From-price in EUR minor units (invariant #5 — never a float). */
  readonly price: number;
  readonly free: number;
  readonly total: number;
  readonly ratingTenths: number;
  readonly reviews: number;
  readonly request?: true;
  readonly water?: number;
  readonly amenities?: readonly Amenity[];
  readonly photos?: number;
  readonly salesClosed?: true;
  readonly closed?: true;
}

const SEEDS: readonly Seed[] = [
  // The north: sparse, cheap, wide sand. It is 190 km from here to Ksamil.
  {
    name: 'Bregu i Bunës',
    beach: 'VELIPOJE',
    offset: [200, -150],
    price: 1200,
    free: 34,
    total: 40,
    ratingTenths: 41,
    reviews: 62,
    water: 25,
    amenities: ['FREE_PARKING', 'SNACK_SHACK', 'SHOWERS'],
    photos: 2,
  },
  {
    name: 'Rana e Hedhun',
    beach: 'SHENGJIN',
    offset: [-300, 250],
    price: 1500,
    free: 18,
    total: 36,
    ratingTenths: 44,
    reviews: 128,
    water: 15,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'FREE_PARKING', 'WIFI'],
    photos: 3,
  },
  {
    name: 'Plazhi i Artë',
    beach: 'DURRES',
    offset: [-250, 120],
    price: 1800,
    free: 9,
    total: 48,
    ratingTenths: 38,
    reviews: 341,
    water: 20,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WIFI', 'WATER_SPORTS'],
    photos: 3,
  },
  {
    name: 'Vila Verde',
    beach: 'DURRES',
    offset: [340, -260],
    price: 1400,
    free: 27,
    total: 30,
    ratingTenths: 35,
    reviews: 47,
    water: 40,
    amenities: ['CAFE', 'FREE_PARKING'],
    photos: 1,
  },
  {
    name: 'Mali Beach Club',
    beach: 'GOLEM',
    offset: [120, 200],
    price: 2000,
    free: 4,
    total: 44,
    ratingTenths: 42,
    reviews: 210,
    water: 12,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'SHOWERS', 'WATER_SPORTS'],
    photos: 3,
  },

  // The bay of Vlorë: the hinge where the sand stops and the riviera starts.
  {
    name: 'Uji i Ftohtë',
    beach: 'VLORE',
    offset: [-180, -120],
    price: 1600,
    free: 21,
    total: 32,
    ratingTenths: 40,
    reviews: 96,
    water: 18,
    amenities: ['CAFE', 'SHOWERS', 'FREE_PARKING'],
    photos: 2,
  },
  {
    name: 'Gjiri i Artë',
    beach: 'RADHIME',
    offset: [220, 160],
    price: 2400,
    free: 12,
    total: 24,
    ratingTenths: 46,
    reviews: 154,
    water: 8,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'SNORKELLING'],
    photos: 3,
  },
  {
    name: 'Marina Orikum',
    beach: 'ORIKUM',
    offset: [-140, 90],
    price: 2200,
    free: 0,
    total: 28,
    ratingTenths: 39,
    reviews: 73,
    water: 22,
    amenities: ['RESTAURANT', 'FREE_PARKING', 'WIFI'],
    photos: 2,
    salesClosed: true,
  },

  // The riviera proper: 74 km of cove after cove, and where the money is.
  {
    name: 'Palasa Sunset',
    beach: 'PALASE',
    offset: [-120, 300],
    price: 3500,
    free: 6,
    total: 20,
    ratingTenths: 48,
    reviews: 187,
    water: 6,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'QUIET_BAY', 'SNORKELLING'],
    photos: 3,
  },
  {
    name: 'Drymades Inn',
    beach: 'DRYMADES',
    offset: [-200, 180],
    price: 3000,
    free: 11,
    total: 26,
    ratingTenths: 45,
    reviews: 264,
    water: 10,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WIFI'],
    photos: 3,
  },
  {
    name: 'Folie Marine',
    beach: 'DRYMADES',
    offset: [260, -220],
    price: 4500,
    free: 2,
    total: 34,
    ratingTenths: 47,
    reviews: 512,
    water: 5,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WATER_SPORTS', 'WIFI'],
    photos: 3,
  },
  {
    name: 'Havana Beach',
    beach: 'DHERMI',
    offset: [-180, 240],
    price: 3200,
    free: 15,
    total: 38,
    ratingTenths: 43,
    reviews: 298,
    water: 9,
    amenities: ['BEACH_BAR', 'CAFE', 'SHOWERS'],
    photos: 2,
  },
  {
    name: 'Dhërmi Bay Club',
    beach: 'DHERMI',
    offset: [140, -60],
    price: 2800,
    free: 23,
    total: 30,
    ratingTenths: 41,
    reviews: 131,
    water: 14,
    amenities: ['RESTAURANT', 'FREE_PARKING', 'PET_FRIENDLY'],
    photos: 1,
  },
  {
    name: 'Luna Rossa',
    beach: 'DHERMI',
    offset: [320, -280],
    price: 2600,
    free: 0,
    total: 22,
    ratingTenths: 0,
    reviews: 0,
    request: true,
    water: 16,
    amenities: ['CAFE', 'SNACK_SHACK'],
    photos: 0,
  },
  {
    name: 'Jale Beach Bar',
    beach: 'JALE',
    offset: [-90, 130],
    price: 2900,
    free: 8,
    total: 26,
    ratingTenths: 44,
    reviews: 176,
    water: 7,
    amenities: ['BEACH_BAR', 'WATER_SPORTS', 'SHOWERS'],
    photos: 3,
  },
  {
    name: 'Livadhi Lounge',
    beach: 'LIVADHI',
    offset: [180, -140],
    price: 2500,
    free: 19,
    total: 28,
    ratingTenths: 40,
    reviews: 88,
    water: 12,
    amenities: ['CAFE', 'FREE_PARKING', 'QUIET_BAY'],
    photos: 2,
  },
  {
    name: 'Potami Beach',
    beach: 'HIMARE',
    offset: [-220, 200],
    price: 2700,
    free: 5,
    total: 32,
    ratingTenths: 46,
    reviews: 223,
    water: 8,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'SNORKELLING', 'WIFI'],
    photos: 3,
  },
  {
    name: 'Himara Riviera',
    beach: 'HIMARE',
    offset: [280, -180],
    price: 2100,
    free: 14,
    total: 24,
    ratingTenths: 37,
    reviews: 59,
    request: true,
    water: 20,
    amenities: ['CAFE', 'SHOWERS'],
    photos: 1,
  },
  {
    name: 'Qeparo Old Shore',
    beach: 'QEPARO',
    offset: [-160, -90],
    price: 1900,
    free: 22,
    total: 26,
    ratingTenths: 42,
    reviews: 104,
    water: 11,
    amenities: ['RESTAURANT', 'QUIET_BAY', 'PET_FRIENDLY'],
    photos: 2,
  },
  {
    name: 'Borsh Long Beach',
    beach: 'BORSH',
    offset: [-400, 260],
    price: 1700,
    free: 31,
    total: 42,
    ratingTenths: 39,
    reviews: 145,
    water: 18,
    amenities: ['BEACH_BAR', 'FREE_PARKING', 'SHOWERS'],
    photos: 2,
  },
  {
    name: 'Ulliri Beach',
    beach: 'BORSH',
    offset: [380, -300],
    price: 1500,
    free: 26,
    total: 30,
    ratingTenths: 0,
    reviews: 0,
    water: 24,
    amenities: ['SNACK_SHACK', 'FREE_PARKING'],
    photos: 0,
  },
  {
    name: 'Kroreza Cove',
    beach: 'LUKOVE',
    offset: [110, 150],
    price: 2300,
    free: 7,
    total: 18,
    ratingTenths: 47,
    reviews: 91,
    water: 5,
    amenities: ['QUIET_BAY', 'SNORKELLING', 'RESTAURANT'],
    photos: 3,
  },

  // Sarandë and Ksamil: the south end, the busiest water on the coast.
  {
    name: 'Santa Quaranta',
    beach: 'SARANDE',
    offset: [-260, 180],
    price: 2600,
    free: 3,
    total: 36,
    ratingTenths: 43,
    reviews: 387,
    water: 13,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WIFI', 'WATER_SPORTS'],
    photos: 3,
  },
  {
    name: 'Mango Beach',
    beach: 'SARANDE',
    offset: [200, -240],
    price: 3100,
    free: 1,
    total: 28,
    ratingTenths: 45,
    reviews: 246,
    water: 6,
    amenities: ['BEACH_BAR', 'CAFE', 'SHOWERS'],
    photos: 2,
  },
  {
    name: 'Pulëbardha Cove',
    beach: 'PULEBARDHA',
    offset: [-80, 110],
    price: 3400,
    free: 9,
    total: 16,
    ratingTenths: 49,
    reviews: 168,
    water: 4,
    amenities: ['QUIET_BAY', 'SNORKELLING', 'CAFE'],
    photos: 3,
  },
  {
    name: 'Ksamil Islands',
    beach: 'KSAMIL',
    offset: [-180, 220],
    price: 3800,
    free: 0,
    total: 40,
    ratingTenths: 44,
    reviews: 604,
    water: 3,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WATER_SPORTS', 'SNORKELLING'],
    photos: 3,
  },
  {
    name: 'Bora Bora Ksamil',
    beach: 'KSAMIL',
    offset: [260, -160],
    price: 4200,
    free: 4,
    total: 32,
    ratingTenths: 46,
    reviews: 438,
    water: 4,
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WIFI'],
    photos: 3,
  },
  {
    name: 'Guri i Bardhë',
    beach: 'KSAMIL',
    offset: [60, -420],
    price: 2400,
    free: 17,
    total: 22,
    ratingTenths: 38,
    reviews: 76,
    request: true,
    water: 15,
    amenities: ['CAFE', 'FREE_PARKING'],
    photos: 1,
    closed: true,
  },
];

/** Metres per degree of latitude; longitude shrinks by the cosine, which at 40°N matters. */
const M_PER_DEG_LAT = 111_320;

function positionOf(seed: Seed): LngLat {
  const centre = beachEntry(seed.beach)?.view.center ?? { lng: 19.75, lat: 40.05 };
  const [east, north] = seed.offset;
  return {
    lng: centre.lng + east / (M_PER_DEG_LAT * Math.cos((centre.lat * Math.PI) / 180)),
    lat: centre.lat + north / M_PER_DEG_LAT,
  };
}

function photosOf(id: number, count: number): readonly PhotoView[] {
  return Array.from({ length: count }, (_unused, slot) => {
    const url = apiPhotoUrl(`/proto-photo/v${id}-${slot}.svg`);
    return { url, sources: [{ url, width: 720 }] };
  });
}

/** The fixture as the discovery API would send it, so every shipped helper reads it unchanged. */
export const FIXTURE_VENUES: readonly VenueSummary[] = SEEDS.map((seed, index) => {
  const id = index + 1;
  const at = positionOf(seed);
  return {
    id,
    name: seed.name,
    beach: seed.beach,
    region: beachEntry(seed.beach)!.region,
    ratingTenths: seed.ratingTenths,
    reviewsCount: seed.reviews,
    bookingMode: seed.request ? 'REQUEST' : 'INSTANT',
    fromPrice: { minorUnits: seed.price, currency: 'EUR' },
    amenities: seed.amenities ?? [],
    distanceToWaterM: seed.water ?? null,
    location: { latitude: at.lat, longitude: at.lng },
    availability: { free: seed.free, total: seed.total },
    photos: photosOf(id, seed.photos ?? 0),
    salesOpen: !seed.salesClosed,
    closedForSeason: seed.closed === true,
    reopensOn: seed.closed ? '2027-05-15' : null,
  } satisfies VenueSummary;
});

/**
 * The shipped {@link VenueCard} projection, trimmed to what the spike renders. Deliberately the
 * same shape `pages/home` builds, so `app-venue-pin-layer` and `app-venue-preview-card` are fed
 * the very record they are fed in production.
 */
export function toCard(venue: VenueSummary, dateLabel: string): VenueCard {
  const rated = isRated(venue);
  const amenities = orderedAmenities(venue.amenities ?? [])
    .slice(0, 3)
    .map((code) => ({ code, label: amenityLabel(code) }));
  const priceLabel = venue.fromPrice ? formatMoney(venue.fromPrice) : null;
  const { free, total } = venue.availability;
  const salesClosed = venue.salesOpen === false;
  const closedForSeason = venue.closedForSeason === true;
  return {
    id: venue.id,
    name: venue.name,
    beach: venue.beach,
    beachLabel: beachLabel(venue.beach),
    regionLabel: regionLabel(venue.region),
    photos: venue.photos ?? [],
    modeLabel: venue.bookingMode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
    isRated: rated,
    rating: ratingScore(venue.ratingTenths),
    reviewsLabel: reviewsLabel(venue.reviewsCount),
    water: distanceToWaterLabel(venue.distanceToWaterM ?? null),
    amenities,
    freePercent: total === 0 ? 0 : Math.round((free / total) * 100),
    priceLabel,
    fromPrice: venue.fromPrice,
    free,
    total,
    salesClosed,
    closedForSeason,
    reopensOn: closedForSeason ? (venue.reopensOn ?? null) : null,
    location: venue.location ?? null,
    ariaLabel:
      `${venue.name}, ${beachLabel(venue.beach)}, ${priceLabel ? `from ${priceLabel} per set, ` : ''}` +
      `${free} of ${total} sets free on ${dateLabel}. View beach map.`,
  };
}

/** Every fixture venue as a map pin, in catalogue (north-to-south) order. */
export function pinsOf(cards: readonly VenueCard[]): readonly VenuePin[] {
  return cards.flatMap((card) =>
    card.location
      ? [
          {
            id: String(card.id),
            at: { lng: card.location.longitude, lat: card.location.latitude },
            card,
          },
        ]
      : [],
  );
}
