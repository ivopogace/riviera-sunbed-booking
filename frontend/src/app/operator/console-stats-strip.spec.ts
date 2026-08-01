import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { Pool, SeatAvailability, SetView, VenueMapView } from '../shared/venue-views';
import { ConsoleStatsStrip } from './console-stats-strip';
import { TakingsView } from './operator-console.model';

const BASE = environment.apiBaseUrl;
const VENUE = 1;

function set(id: number, availability: SeatAvailability, pool: Pool = 'ONLINE'): SetView {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'STANDARD',
    pool,
    price: { minorUnits: 4000, currency: 'EUR' },
    gridX: id,
    gridY: 0,
    availability,
  };
}

function venueMap(sets: SetView[]): VenueMapView {
  return {
    id: VENUE,
    name: 'Miramar',
    beach: 'Ksamil',
    region: 'Riviera',
    description: '',
    ratingTenths: 48,
    reviewsCount: 1,
    bookingMode: 'INSTANT',
    fromPrice: null,
    sets,
  };
}

const TAKINGS: TakingsView = {
  gross: { minorUnits: 11000, currency: 'EUR' },
  net: { minorUnits: 9350, currency: 'EUR' },
  commissionBps: 1500,
  date: '2026-07-07',
};

describe('ConsoleStatsStrip (#171, O2)', () => {
  let fixture: ComponentFixture<ConsoleStatsStrip>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ConsoleStatsStrip],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(testid: string): string {
    return (
      host()
        .querySelector(`[data-testid="${testid}"]`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  }

  async function render(
    venue: VenueMapView | undefined,
    booked: number | 'fail',
    takings: TakingsView | 'fail',
  ): Promise<void> {
    fixture = TestBed.createComponent(ConsoleStatsStrip);
    fixture.componentRef.setInput('venueId', VENUE);
    fixture.componentRef.setInput('venue', venue);
    await fixture.whenStable();
    const bookingsReq = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}/bookings` && r.method === 'GET',
    );
    if (booked === 'fail') {
      bookingsReq.flush({}, { status: 500, statusText: 'Server Error' });
    } else {
      bookingsReq.flush(Array.from({ length: booked }, (_, i) => ({ setId: i + 1, code: 'X' })));
    }
    const takingsReq = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}/takings` && r.method === 'GET',
    );
    if (takings === 'fail') {
      takingsReq.flush({}, { status: 500, statusText: 'Server Error' });
    } else {
      takingsReq.flush(takings);
    }
    await fixture.whenStable();
  }

  it('derives free/total, booked-online and walk-ins from the map + bookings (#171 AC-6)', async () => {
    // 5 sets: 2 FREE, 3 TAKEN; 2 of the taken are confirmed online bookings -> 1 walk-in.
    const map = venueMap([
      set(1, 'FREE'),
      set(2, 'FREE'),
      set(3, 'TAKEN'),
      set(4, 'TAKEN'),
      set(5, 'TAKEN', 'WALK_IN'),
    ]);

    await render(map, 2, TAKINGS);

    expect(text('oc-stat-free')).toBe('2 / 5');
    expect(text('oc-stat-booked')).toBe('2');
    expect(text('oc-stat-walkins')).toBe('1');
  });

  it('renders gross takings + net-after-commission via formatMoney, no client math (#171 AC-7)', async () => {
    await render(venueMap([]), 0, TAKINGS);

    expect(text('oc-stat-takings')).toBe('€110'); // 11000 minor -> €110
    expect(text('oc-stat-net')).toContain('€93.50'); // 9350 minor -> €93.50 (server-computed net)
    expect(text('oc-stat-net')).toContain('after 15% commission');
  });

  it('shows zeros and a dash on an empty day / failed takings, without error (#171 AC-4)', async () => {
    await render(venueMap([]), 0, 'fail');

    expect(text('oc-stat-free')).toBe('0 / 0');
    expect(text('oc-stat-booked')).toBe('0');
    expect(text('oc-stat-walkins')).toBe('0');
    expect(text('oc-stat-takings')).toBe('—');
  });

  it('degrades booked + walk-ins to a dash (not a phantom count) when the bookings read fails', async () => {
    // 5 sets, 2 free -> 3 taken; the /bookings read fails, so booked-online is unknown. Walk-ins must
    // NOT render "3" (it would mislabel taken-but-unknown sets as walk-ins) — both show "—".
    const map = venueMap([
      set(1, 'FREE'),
      set(2, 'FREE'),
      set(3, 'TAKEN'),
      set(4, 'TAKEN'),
      set(5, 'TAKEN'),
    ]);

    await render(map, 'fail', TAKINGS);

    expect(text('oc-stat-free')).toBe('2 / 5'); // free/total still come from the map
    expect(text('oc-stat-booked')).toBe('—');
    expect(text('oc-stat-walkins')).toBe('—');
    expect(text('oc-stat-takings')).toBe('€110'); // the independent takings read still renders
  });
});
