/**
 * PROTOTYPE — throwaway (spike: where the riviera map belongs on Discover, on desktop).
 * Twenty-six venues along the real coast, in catalogue (north→south) order, shaped exactly like
 * the list card the shipped page renders so every shipped primitive can be fed as-is.
 */
import {
  amenityLabel,
  distanceToWaterLabel,
  orderedAmenities,
  Amenity,
} from '../../shared/amenities';
import {
  BEACH_CATALOGUE,
  BeachCode,
  beachEntry,
  beachLabel,
  regionLabel,
} from '../../shared/beaches';
import { formatMoney } from '../../shared/money';
import { PhotoView } from '../../shared/venue-views';
import { VenuePin } from '../home/pin-crowding';
import { VenueCard } from '../home/venue-card';

interface Seed {
  readonly name: string;
  readonly beach: BeachCode;
  /** Offset from the beach's recorded centre, in thousandths of a degree (lng, lat). */
  readonly d: readonly [number, number];
  readonly price: number | null;
  readonly rating: number;
  readonly reviews: number;
  readonly mode: 'INSTANT' | 'REQUEST';
  readonly amenities: readonly Amenity[];
  readonly water: number | null;
  readonly free: number;
  readonly total: number;
  readonly photos: number;
  readonly salesClosed?: boolean;
  readonly closedForSeason?: boolean;
}

const SEEDS: readonly Seed[] = [
  {
    name: 'Bora Bora Velipojë',
    beach: 'VELIPOJE',
    d: [-6, 2],
    price: 1200,
    rating: 41,
    reviews: 12,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'FREE_PARKING', 'SHOWERS'],
    water: 20,
    free: 31,
    total: 40,
    photos: 1,
  },
  {
    name: 'Rana Beach Club',
    beach: 'SHENGJIN',
    d: [4, -3],
    price: 1500,
    rating: 44,
    reviews: 38,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'WIFI', 'PET_FRIENDLY'],
    water: 12,
    free: 8,
    total: 36,
    photos: 2,
  },
  {
    name: 'Iliria Lido',
    beach: 'DURRES',
    d: [-5, 4],
    price: 1000,
    rating: 39,
    reviews: 121,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'CAFE', 'SHOWERS'],
    water: 30,
    free: 44,
    total: 60,
    photos: 3,
  },
  {
    name: 'Vollga Sunbeds',
    beach: 'DURRES',
    d: [3, -6],
    price: 900,
    rating: 0,
    reviews: 0,
    mode: 'REQUEST',
    amenities: ['CAFE'],
    water: 15,
    free: 22,
    total: 22,
    photos: 0,
  },
  {
    name: 'Golem Sands',
    beach: 'GOLEM',
    d: [2, 5],
    price: 1400,
    rating: 42,
    reviews: 57,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'FREE_PARKING', 'WATER_SPORTS', 'WIFI'],
    water: 25,
    free: 3,
    total: 48,
    photos: 2,
  },
  {
    name: 'Qerret Palms',
    beach: 'QERRET',
    d: [-3, 1],
    price: 1600,
    rating: 46,
    reviews: 19,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SHOWERS'],
    water: 18,
    free: 17,
    total: 24,
    photos: 1,
  },
  {
    name: 'Lungomare Lido',
    beach: 'VLORE',
    d: [-8, 6],
    price: 1800,
    rating: 40,
    reviews: 66,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'CAFE', 'WIFI'],
    water: 40,
    free: 26,
    total: 30,
    photos: 2,
    salesClosed: true,
  },
  {
    name: 'Radhima Cove',
    beach: 'RADHIME',
    d: [2, -2],
    price: 2000,
    rating: 45,
    reviews: 23,
    mode: 'REQUEST',
    amenities: ['SNORKELLING', 'QUIET_BAY'],
    water: 8,
    free: 5,
    total: 16,
    photos: 1,
  },
  {
    name: 'Palasa Bay Club',
    beach: 'PALASE',
    d: [-4, 3],
    price: 3500,
    rating: 47,
    reviews: 84,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'BEACH_BAR', 'SHOWERS', 'WIFI'],
    water: 10,
    free: 12,
    total: 40,
    photos: 3,
  },
  {
    name: 'Drymades Inn Beach',
    beach: 'DRYMADES',
    d: [-3, 2],
    price: 3000,
    rating: 43,
    reviews: 51,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'RESTAURANT'],
    water: 6,
    free: 0,
    total: 28,
    photos: 2,
  },
  {
    name: 'Sea Turtle Bar',
    beach: 'DRYMADES',
    d: [4, -3],
    price: 2500,
    rating: 44,
    reviews: 29,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SNACK_SHACK', 'PET_FRIENDLY'],
    water: 12,
    free: 9,
    total: 20,
    photos: 1,
  },
  {
    name: 'Havana Beach',
    beach: 'DHERMI',
    d: [-5, 4],
    price: 4000,
    rating: 48,
    reviews: 212,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'BEACH_BAR', 'WATER_SPORTS', 'WIFI'],
    water: 5,
    free: 6,
    total: 64,
    photos: 3,
  },
  {
    name: 'Blue Cave Lido',
    beach: 'DHERMI',
    d: [1, -1],
    price: 3200,
    rating: 45,
    reviews: 97,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SNORKELLING', 'SHOWERS'],
    water: 9,
    free: 21,
    total: 44,
    photos: 2,
  },
  {
    name: 'Dhërmi Pier',
    beach: 'DHERMI',
    d: [6, -5],
    price: 2800,
    rating: 0,
    reviews: 0,
    mode: 'REQUEST',
    amenities: ['CAFE', 'SNACK_SHACK'],
    water: 14,
    free: 18,
    total: 18,
    photos: 1,
  },
  {
    name: 'Gjipe Canyon Camp',
    beach: 'GJIPE',
    d: [0, 1],
    price: 1500,
    rating: 46,
    reviews: 33,
    mode: 'REQUEST',
    amenities: ['QUIET_BAY', 'SNORKELLING'],
    water: 4,
    free: 7,
    total: 10,
    photos: 1,
  },
  {
    name: 'Folie Marine',
    beach: 'JALE',
    d: [-3, 2],
    price: 4500,
    rating: 47,
    reviews: 156,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'BEACH_BAR', 'WATER_SPORTS', 'WIFI', 'SHOWERS'],
    water: 3,
    free: 2,
    total: 52,
    photos: 3,
  },
  {
    name: 'Jala Sunset',
    beach: 'JALE',
    d: [4, -2],
    price: 2600,
    rating: 42,
    reviews: 41,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SNACK_SHACK'],
    water: 11,
    free: 14,
    total: 30,
    photos: 2,
  },
  {
    name: 'Spile Sunbeds',
    beach: 'HIMARE',
    d: [-4, 3],
    price: 2000,
    rating: 41,
    reviews: 72,
    mode: 'INSTANT',
    amenities: ['CAFE', 'FREE_PARKING', 'SHOWERS'],
    water: 16,
    free: 25,
    total: 36,
    photos: 2,
  },
  {
    name: 'Potam Lido',
    beach: 'POTAM',
    d: [2, -1],
    price: 1800,
    rating: 43,
    reviews: 27,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'PET_FRIENDLY'],
    water: 7,
    free: 11,
    total: 24,
    photos: 1,
  },
  {
    name: 'Qeparo Stone Beach',
    beach: 'QEPARO',
    d: [-2, 2],
    price: 1500,
    rating: 44,
    reviews: 18,
    mode: 'REQUEST',
    amenities: ['QUIET_BAY', 'CAFE'],
    water: 10,
    free: 13,
    total: 20,
    photos: 1,
  },
  {
    name: 'Borsh Olive Grove',
    beach: 'BORSH',
    d: [5, -4],
    price: 1200,
    rating: 40,
    reviews: 44,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'FREE_PARKING', 'SHOWERS'],
    water: 22,
    free: 39,
    total: 50,
    photos: 2,
  },
  {
    name: 'Mango Beach',
    beach: 'SARANDE',
    d: [-4, 3],
    price: 2200,
    rating: 42,
    reviews: 88,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'RESTAURANT', 'WIFI'],
    water: 9,
    free: 4,
    total: 40,
    photos: 3,
  },
  {
    name: 'Santa Quaranta Lido',
    beach: 'SARANDE',
    d: [3, -3],
    price: 2400,
    rating: 43,
    reviews: 61,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'CAFE', 'SHOWERS'],
    water: 13,
    free: 16,
    total: 32,
    photos: 2,
    closedForSeason: true,
  },
  {
    name: 'Mirror Beach Club',
    beach: 'PASQYRA',
    d: [1, 1],
    price: 3800,
    rating: 49,
    reviews: 132,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SNORKELLING', 'WATER_SPORTS'],
    water: 2,
    free: 1,
    total: 22,
    photos: 3,
  },
  {
    name: 'Bora Bora Ksamil',
    beach: 'KSAMIL',
    d: [-4, 3],
    price: 3500,
    rating: 46,
    reviews: 301,
    mode: 'INSTANT',
    amenities: ['RESTAURANT', 'BEACH_BAR', 'WATER_SPORTS', 'WIFI'],
    water: 4,
    free: 10,
    total: 60,
    photos: 3,
  },
  {
    name: 'Twin Islands Beach',
    beach: 'KSAMIL',
    d: [2, -3],
    price: 3000,
    rating: 44,
    reviews: 148,
    mode: 'INSTANT',
    amenities: ['BEACH_BAR', 'SNORKELLING', 'SHOWERS'],
    water: 6,
    free: 0,
    total: 40,
    photos: 2,
  },
  {
    name: 'Lori Beach',
    beach: 'KSAMIL',
    d: [5, 1],
    price: null,
    rating: 0,
    reviews: 0,
    mode: 'REQUEST',
    amenities: ['CAFE'],
    water: 8,
    free: 0,
    total: 0,
    photos: 0,
  },
];

function photos(count: number, seed: number): readonly PhotoView[] {
  return Array.from({ length: count }, (_unused, i) => {
    const url = `/prototype-map/photo-${((seed + i) % 8) + 1}.svg`;
    return { url, sources: [{ url, width: 720 }] };
  });
}

function toCard(seed: Seed, index: number): VenueCard {
  const id = index + 1;
  const entry = beachEntry(seed.beach)!;
  const fromPrice = seed.price === null ? null : { minorUnits: seed.price, currency: 'EUR' };
  const priceLabel = fromPrice ? formatMoney(fromPrice) : null;
  const rated = seed.reviews > 0;
  const closedForSeason = seed.closedForSeason === true;
  return {
    id,
    name: seed.name,
    beach: seed.beach,
    beachLabel: beachLabel(seed.beach),
    regionLabel: regionLabel(entry.region),
    photos: photos(seed.photos, index),
    modeLabel: seed.mode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
    isRated: rated,
    rating: (seed.rating / 10).toFixed(1),
    reviewsLabel: `${seed.reviews} review${seed.reviews === 1 ? '' : 's'}`,
    water: distanceToWaterLabel(seed.water),
    amenities: orderedAmenities(seed.amenities)
      .slice(0, 3)
      .map((code) => ({ code, label: amenityLabel(code) })),
    freePercent: seed.total === 0 ? 0 : Math.round((seed.free / seed.total) * 100),
    priceLabel,
    fromPrice,
    free: seed.free,
    total: seed.total,
    salesClosed: seed.salesClosed === true,
    closedForSeason,
    reopensOn: closedForSeason ? '2027-05-15' : null,
    location: {
      longitude: entry.view.center.lng + seed.d[0] / 1000,
      latitude: entry.view.center.lat + seed.d[1] / 1000,
    },
    ariaLabel: `${seed.name}, ${beachLabel(seed.beach)}${priceLabel ? `, from ${priceLabel} per set` : ''}, ${seed.free} of ${seed.total} sets free. View beach map.`,
  };
}

/** The fixture in coast order — `BEACH_CATALOGUE` order first, then the seed order within a beach. */
export const FIXTURE_CARDS: readonly VenueCard[] = SEEDS.map(toCard).sort(
  (a, b) => coastIndex(a.beach) - coastIndex(b.beach),
);

/** The pins a card list draws: one per card, at the card's location, in the list's order. */
export function pinsOf(cards: readonly VenueCard[]): readonly VenuePin[] {
  return cards.map((card) => ({
    id: String(card.id),
    at: { lng: card.location!.longitude, lat: card.location!.latitude },
    card,
  }));
}

export const FIXTURE_PINS: readonly VenuePin[] = pinsOf(FIXTURE_CARDS);

export function coastIndex(beach: string): number {
  return BEACH_CATALOGUE.findIndex((entry) => entry.code === beach);
}

/** The catalogue beaches that have at least one fixture venue, in coast order, with their cards. */
export interface BeachGroup {
  readonly code: BeachCode;
  readonly label: string;
  readonly region: string;
  readonly cards: readonly VenueCard[];
  readonly from: string | null;
}

export const BEACH_GROUPS: readonly BeachGroup[] = BEACH_CATALOGUE.flatMap((entry) => {
  const cards = FIXTURE_CARDS.filter((card) => card.beach === entry.code);
  if (cards.length === 0) {
    return [];
  }
  const prices = cards.flatMap((card) => (card.fromPrice ? [card.fromPrice] : []));
  const lowest = prices.length
    ? prices.reduce((a, b) => (b.minorUnits < a.minorUnits ? b : a))
    : null;
  return [
    {
      code: entry.code,
      label: entry.label,
      region: regionLabel(entry.region),
      cards,
      from: lowest ? formatMoney(lowest) : null,
    },
  ];
});

/** A dated date label, deterministic for screenshots; the shipped page derives it from `?date`. */
export function cardsForDate(date: string): readonly VenueCard[] {
  const day = Number(date.slice(-2)) || 0;
  return FIXTURE_CARDS.map((card) => {
    if (card.total === 0) {
      return card;
    }
    const free = Math.min(card.total, (card.free + day * 3) % (card.total + 1));
    return { ...card, free, freePercent: Math.round((free / card.total) * 100) };
  });
}
