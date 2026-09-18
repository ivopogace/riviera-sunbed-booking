import { Amenity, amenityLabel } from '../../shared/amenities';
import { BeachCode, beachEntry, beachLabel, regionLabel } from '../../shared/beaches';
import { formatMoney, MoneyView } from '../../shared/money';
import { VenueLocation } from '../../shared/venue-views';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';

/**
 * PROTOTYPE FIXTURE — spike branch only, never shipped. ~26 venues along the real riviera coast,
 * placed a few hundred metres off the catalogue's recorded beach centre (`shared/beaches.ts`) so
 * the map fence, the pin-crowding math and the camera derivation are all exercised against real
 * coastline geometry rather than invented coordinates. Photos are generated SVG stand-ins
 * (`public/prototype-map/photos/`) — judge photo MASS, not content, per the design brief.
 */
interface FixtureSeed {
  readonly beach: BeachCode;
  readonly name: string;
  readonly priceEur: number | null;
  readonly free: number;
  readonly total: number;
  readonly rating: number | null;
  readonly reviews: number;
  readonly mode: 'INSTANT' | 'REQUEST';
  readonly salesClosed?: boolean;
  readonly closedForSeason?: boolean;
  /** Small offset in degrees from the catalogue beach centre, so venues on the same beach separate. */
  readonly offset: readonly [number, number];
}

const SEEDS: readonly FixtureSeed[] = [
  {
    beach: 'VELIPOJE',
    name: 'Velipojë Sunset Club',
    priceEur: 22,
    free: 6,
    total: 20,
    rating: 44,
    reviews: 38,
    mode: 'INSTANT',
    offset: [0.004, 0.001],
  },
  {
    beach: 'SHENGJIN',
    name: 'Shëngjin Bay Loungers',
    priceEur: 18,
    free: 12,
    total: 24,
    rating: 41,
    reviews: 12,
    mode: 'INSTANT',
    offset: [-0.003, 0.002],
  },
  {
    beach: 'PATOK',
    name: 'Patok Pines Beach Bar',
    priceEur: 20,
    free: 0,
    total: 16,
    rating: 39,
    reviews: 7,
    mode: 'REQUEST',
    offset: [0.002, -0.002],
  },
  {
    beach: 'LALEZ',
    name: 'Lalëz Cove Resort',
    priceEur: 35,
    free: 9,
    total: 30,
    rating: 47,
    reviews: 96,
    mode: 'INSTANT',
    offset: [-0.004, 0.003],
  },
  {
    beach: 'DURRES',
    name: 'Durrës Riviera Deck',
    priceEur: 25,
    free: 15,
    total: 40,
    rating: 42,
    reviews: 54,
    mode: 'INSTANT',
    offset: [0.003, 0.002],
  },
  {
    beach: 'DURRES',
    name: 'Currila Promenade Sunbeds',
    priceEur: 19,
    free: 4,
    total: 18,
    rating: 38,
    reviews: 21,
    mode: 'INSTANT',
    offset: [-0.006, -0.003],
  },
  {
    beach: 'SHKEMBI_I_KAVAJES',
    name: 'Shkëmbi Cliffside Sunbeds',
    priceEur: 30,
    free: 3,
    total: 12,
    rating: 46,
    reviews: 29,
    mode: 'REQUEST',
    offset: [0.002, 0.002],
  },
  {
    beach: 'GOLEM',
    name: 'Golem Sands',
    priceEur: 16,
    free: 22,
    total: 32,
    rating: null,
    reviews: 0,
    mode: 'INSTANT',
    offset: [-0.002, -0.001],
  },
  {
    beach: 'QERRET',
    name: 'Qerret Pinewood Beach',
    priceEur: 21,
    free: 7,
    total: 20,
    rating: 43,
    reviews: 33,
    mode: 'INSTANT',
    offset: [0.003, -0.002],
  },
  {
    beach: 'SPILLE',
    name: 'Spille Dune Club',
    priceEur: 17,
    free: 10,
    total: 20,
    rating: 37,
    reviews: 9,
    mode: 'INSTANT',
    offset: [-0.003, 0.002],
    salesClosed: true,
  },
  {
    beach: 'DIVJAKE',
    name: 'Divjakë Lagoon Beach',
    priceEur: 15,
    free: 18,
    total: 24,
    rating: 40,
    reviews: 14,
    mode: 'INSTANT',
    offset: [0.004, 0.001],
  },
  {
    beach: 'SEMAN',
    name: 'Seman River Mouth Club',
    priceEur: 14,
    free: 8,
    total: 16,
    rating: null,
    reviews: 0,
    mode: 'REQUEST',
    offset: [-0.002, -0.002],
  },
  {
    beach: 'VLORE',
    name: 'Vlorë Bay Terrace',
    priceEur: 28,
    free: 20,
    total: 45,
    rating: 45,
    reviews: 121,
    mode: 'INSTANT',
    offset: [0.005, 0.003],
  },
  {
    beach: 'VLORE',
    name: 'Zvërnec Marina Sunbeds',
    priceEur: 24,
    free: 5,
    total: 18,
    rating: 41,
    reviews: 27,
    mode: 'INSTANT',
    offset: [-0.006, -0.004],
  },
  {
    beach: 'RADHIME',
    name: 'Radhimë Rocks',
    priceEur: 27,
    free: 2,
    total: 14,
    rating: 44,
    reviews: 41,
    mode: 'REQUEST',
    offset: [0.003, 0.002],
  },
  {
    beach: 'ORIKUM',
    name: 'Orikum Marina Beach',
    priceEur: 19,
    free: 13,
    total: 22,
    rating: 39,
    reviews: 18,
    mode: 'INSTANT',
    offset: [-0.003, -0.002],
  },
  {
    beach: 'PALASE',
    name: 'Palasë Panorama',
    priceEur: 32,
    free: 6,
    total: 16,
    rating: 48,
    reviews: 63,
    mode: 'REQUEST',
    offset: [0.002, 0.001],
  },
  {
    beach: 'DHERMI',
    name: 'Dhërmi Blue Lagoon',
    priceEur: 38,
    free: 11,
    total: 34,
    rating: 47,
    reviews: 154,
    mode: 'INSTANT',
    offset: [-0.003, 0.002],
  },
  {
    beach: 'DHERMI',
    name: 'Gjipe Canyon Beach Club',
    priceEur: 26,
    free: 0,
    total: 10,
    rating: 46,
    reviews: 22,
    mode: 'REQUEST',
    offset: [0.006, -0.004],
    closedForSeason: true,
  },
  {
    beach: 'JALE',
    name: 'Jalë Sunset Terrace',
    priceEur: 29,
    free: 8,
    total: 20,
    rating: 45,
    reviews: 47,
    mode: 'INSTANT',
    offset: [-0.002, 0.002],
  },
  {
    beach: 'HIMARE',
    name: 'Himarë Old Town Beach',
    priceEur: 23,
    free: 17,
    total: 28,
    rating: 42,
    reviews: 39,
    mode: 'INSTANT',
    offset: [0.003, 0.001],
  },
  {
    beach: 'QEPARO',
    name: 'Qeparo Castle Beach',
    priceEur: 20,
    free: 9,
    total: 16,
    rating: 40,
    reviews: 16,
    mode: 'INSTANT',
    offset: [-0.003, -0.002],
  },
  {
    beach: 'BORSH',
    name: 'Borsh Long Sands',
    priceEur: 18,
    free: 25,
    total: 38,
    rating: 41,
    reviews: 31,
    mode: 'INSTANT',
    offset: [0.004, 0.003],
  },
  {
    beach: 'LUKOVE',
    name: 'Lukovë Quiet Bay',
    priceEur: 21,
    free: 4,
    total: 12,
    rating: 43,
    reviews: 20,
    mode: 'REQUEST',
    offset: [-0.002, 0.001],
  },
  {
    beach: 'SARANDE',
    name: 'Sarandë Promenade',
    priceEur: 24,
    free: 14,
    total: 30,
    rating: 44,
    reviews: 88,
    mode: 'INSTANT',
    offset: [0.003, -0.002],
  },
  {
    beach: 'KSAMIL',
    name: 'Ksamil Island View',
    priceEur: 33,
    free: 3,
    total: 20,
    rating: 49,
    reviews: 203,
    mode: 'INSTANT',
    offset: [-0.004, 0.002],
  },
];

const AMENITIES: readonly Amenity[] = ['SHOWERS', 'BEACH_BAR'];

function photoUrl(id: number): string {
  return `/prototype-map/photos/venue-${id}.svg`;
}

function money(eur: number): MoneyView {
  return { minorUnits: eur * 100, currency: 'EUR' };
}

function toCard(seed: FixtureSeed, id: number): VenueCard {
  const entry = beachEntry(seed.beach);
  const location: VenueLocation | null = entry
    ? {
        longitude: entry.view.center.lng + seed.offset[0],
        latitude: entry.view.center.lat + seed.offset[1],
      }
    : null;
  const rated = seed.rating !== null;
  const price = seed.priceEur !== null ? money(seed.priceEur) : null;
  const freePercent = seed.total === 0 ? 0 : Math.round((seed.free / seed.total) * 100);
  return {
    id,
    name: seed.name,
    beach: seed.beach,
    beachLabel: beachLabel(seed.beach),
    regionLabel: regionLabel(entry?.region ?? ''),
    photos: [{ url: photoUrl(id), sources: [{ url: photoUrl(id), width: 800 }] }],
    modeLabel: seed.mode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
    isRated: rated,
    rating: seed.rating !== null ? (seed.rating / 10).toFixed(1) : '',
    reviewsLabel: seed.reviews === 1 ? '1 review' : `${seed.reviews} reviews`,
    water: seed.offset[1] % 2 === 0 ? '20m to water' : '40m to water',
    amenities: AMENITIES.map((code) => ({ code, label: amenityLabel(code) })),
    freePercent,
    priceLabel: price ? formatMoney(price) : null,
    fromPrice: price,
    free: seed.free,
    total: seed.total,
    salesClosed: seed.salesClosed ?? false,
    closedForSeason: seed.closedForSeason ?? false,
    reopensOn: seed.closedForSeason ? '2027-05-01' : null,
    location,
    ariaLabel: `${seed.name}, ${beachLabel(seed.beach)}`,
  };
}

/** The prototype's fixed 26-venue catalogue, north to south, ids 0..25. */
export const PROTOTYPE_VENUES: readonly VenueCard[] = SEEDS.map((seed, id) => toCard(seed, id));

/** The venue pins the shared pin layer / map draw, derived exactly as `Home.pins` derives them. */
export const PROTOTYPE_PINS: readonly VenuePin[] = PROTOTYPE_VENUES.flatMap((card) =>
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

export function fixtureVenue(id: string | null): VenueCard | null {
  if (id === null) {
    return null;
  }
  return PROTOTYPE_VENUES.find((card) => String(card.id) === id) ?? null;
}
