import type { MockPhotoView } from './photo-views';

/**
 * The wire's venue vocabulary as the mocked suite types its fixtures. A hand copy of
 * `src/app/shared/beaches.ts`' `BeachCode` and `RegionCode`, `amenities.ts`' `Amenity` and
 * `venue-views.ts`' `BookingMode`, `SeatAvailability`, `Tier` and `Pool`: this suite takes nothing
 * from app source, so a code added or renamed there must be added or renamed here too.
 */
export type MockRegionCode =
  'SHKODER' | 'LEZHE' | 'DURRES' | 'FIER' | 'VLORE' | 'HIMARE' | 'SARANDE';

export type MockBeachCode =
  | 'VELIPOJE'
  | 'SHENGJIN'
  | 'TALE'
  | 'PATOK'
  | 'LALEZ'
  | 'CURRILA'
  | 'DURRES'
  | 'SHKEMBI_I_KAVAJES'
  | 'GOLEM'
  | 'QERRET'
  | 'SPILLE'
  | 'DIVJAKE'
  | 'SEMAN'
  | 'DAREZEZE'
  | 'ZVERNEC'
  | 'VLORE'
  | 'RADHIME'
  | 'ORIKUM'
  | 'PALASE'
  | 'DRYMADES'
  | 'DHERMI'
  | 'GJIPE'
  | 'JALE'
  | 'LIVADHI'
  | 'HIMARE'
  | 'POTAM'
  | 'LLAMANI'
  | 'QEPARO'
  | 'BORSH'
  | 'LUKOVE'
  | 'BUNEC'
  | 'KAKOME'
  | 'SARANDE'
  | 'PASQYRA'
  | 'PULEBARDHA'
  | 'KSAMIL';

export type MockAmenity =
  | 'BEACH_BAR'
  | 'RESTAURANT'
  | 'CAFE'
  | 'FREE_PARKING'
  | 'SHOWERS'
  | 'WIFI'
  | 'WATER_SPORTS'
  | 'PET_FRIENDLY'
  | 'SNACK_SHACK'
  | 'SNORKELLING'
  | 'QUIET_BAY';

export type MockBookingMode = 'INSTANT' | 'REQUEST';
export type MockSeatAvailability = 'FREE' | 'PARTLY_FREE' | 'TAKEN';
export type MockTier = 'PREMIUM' | 'STANDARD';
export type MockPool = 'ONLINE' | 'WALK_IN';

export interface MockMoney {
  readonly minorUnits: number;
  readonly currency: string;
}

/**
 * One `GET /api/venues` row: a hand copy of `src/app/shared/venue-views.ts`' `VenueSummary`, so a
 * fixture missing, misnaming or mis-coding a field fails `npm run typecheck:e2e`. The optional
 * members are the ones a fixture may leave out; the stay read's `stay` verdict is not mirrored yet.
 */
export interface MockVenueSummary {
  readonly id: number;
  readonly name: string;
  readonly beach: MockBeachCode;
  readonly region: MockRegionCode;
  readonly ratingTenths: number;
  readonly reviewsCount: number;
  readonly bookingMode: MockBookingMode;
  readonly fromPrice: MockMoney | null;
  readonly amenities?: readonly MockAmenity[];
  readonly distanceToWaterM?: number | null;
  readonly location?: { readonly latitude: number; readonly longitude: number } | null;
  readonly availability: { readonly free: number; readonly total: number };
  readonly sellsOnline: boolean;
  readonly coverPhoto?: { readonly card: MockPhotoView; readonly banner: MockPhotoView } | null;
  readonly photos?: readonly MockPhotoView[];
  readonly salesOpen?: boolean;
  readonly closedForSeason?: boolean;
  readonly reopensOn?: string | null;
}

/** One beach-map set: a hand copy of `src/app/shared/venue-views.ts`' `SetView`. */
export interface MockSetView {
  readonly id: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly tier: MockTier;
  readonly pool: MockPool;
  readonly price: MockMoney;
  readonly gridX: number;
  readonly gridY: number;
  readonly availability: MockSeatAvailability;
  readonly freeDays?: number;
  readonly takenDates?: readonly string[];
}
