import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { addDays, todayBookingDate } from '../shared/booking-date';
import { Pool, SeatAvailability, SetView, VenueMapView } from '../shared/venue-views';
import { AvailabilityChanges } from './availability-changes';
import { ConsoleStatsStrip } from './console-stats-strip';
import { SetDayState, TakingsView } from './operator-console.model';

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
    beach: 'KSAMIL',
    region: 'SARANDE',
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
      host().querySelector(`[data-testid="${testid}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ??
      ''
    );
  }

  async function render(
    venue: VenueMapView | undefined,
    booked: number | 'fail',
    takings: TakingsView | 'fail',
    held: SetDayState[] | 'fail' = [],
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
    const heldReq = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/${VENUE}/availability` && r.method === 'GET',
    );
    if (held === 'fail') {
      heldReq.flush({}, { status: 500, statusText: 'Server Error' });
    } else {
      heldReq.flush(held);
    }
    await fixture.whenStable();
  }

  it('derives free/total from the map and walk-ins from the server states (#207)', async () => {
    // 2 online holds + 1 staff mark -> 1 walk-in, regardless of the CONFIRMED count.
    const map = venueMap([
      set(1, 'FREE'),
      set(2, 'FREE'),
      set(3, 'TAKEN'),
      set(4, 'TAKEN'),
      set(5, 'TAKEN', 'WALK_IN'),
    ]);

    await render(map, 2, TAKINGS, [
      { setId: 3, state: 'BOOKED_ONLINE' },
      { setId: 4, state: 'BOOKED_ONLINE' },
      { setId: 5, state: 'STAFF_MARKED' },
    ]);

    expect(text('oc-stat-free')).toBe('2 / 5');
    expect(text('oc-stat-booked')).toBe('2');
    expect(text('oc-stat-walkins')).toBe('1');
  });

  it('never counts an unpaid online hold as a walk-in (#207 AC-6)', async () => {
    // An unpaid BOOKED_ONLINE hold with zero CONFIRMED bookings: the old derivation showed 1.
    const map = venueMap([set(1, 'FREE'), set(2, 'TAKEN')]);

    await render(map, 0, TAKINGS, [{ setId: 2, state: 'BOOKED_ONLINE' }]);

    expect(text('oc-stat-booked')).toBe('0');
    expect(text('oc-stat-walkins')).toBe('0');
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

  it('degrades booked to a dash on a failed bookings read; walk-ins stay exact (#207)', async () => {
    // The bookings read failing no longer poisons walk-ins — they come from the states read now.
    const map = venueMap([set(1, 'FREE'), set(2, 'TAKEN'), set(3, 'TAKEN')]);

    await render(map, 'fail', TAKINGS, [
      { setId: 2, state: 'BOOKED_ONLINE' },
      { setId: 3, state: 'STAFF_MARKED' },
    ]);

    expect(text('oc-stat-free')).toBe('1 / 3'); // free/total still come from the map
    expect(text('oc-stat-booked')).toBe('—');
    expect(text('oc-stat-walkins')).toBe('1');
    expect(text('oc-stat-takings')).toBe('€110'); // the independent takings read still renders
  });

  it('degrades walk-ins to a dash (not a phantom count) when the states read fails (#207 AC-6)', async () => {
    const map = venueMap([set(1, 'FREE'), set(2, 'TAKEN'), set(3, 'TAKEN')]);

    await render(map, 1, TAKINGS, 'fail');

    expect(text('oc-stat-free')).toBe('1 / 3');
    expect(text('oc-stat-booked')).toBe('1'); // the independent bookings read still renders
    expect(text('oc-stat-walkins')).toBe('—');
  });

  const HELD_URL = `${BASE}/api/venues/${VENUE}/availability`;

  it('re-reads today’s held states on an announced change for its venue today — walk-ins only (#1525 AC-3)', async () => {
    const map = venueMap([set(1, 'FREE'), set(2, 'FREE'), set(3, 'TAKEN')]);
    await render(map, 1, TAKINGS, [{ setId: 3, state: 'BOOKED_ONLINE' }]);
    expect(text('oc-stat-walkins')).toBe('0');

    TestBed.inject(AvailabilityChanges).announce({
      venueId: VENUE,
      date: todayBookingDate(new Date()),
    });
    await fixture.whenStable();
    // The old count stands until the fresh read lands — no dash flicker on every tap.
    expect(text('oc-stat-walkins')).toBe('0');
    const req = httpMock.expectOne((r) => r.url === HELD_URL && r.method === 'GET');
    expect(req.request.params.get('date')).toBe(todayBookingDate(new Date()));
    req.flush([
      { setId: 3, state: 'BOOKED_ONLINE' },
      { setId: 1, state: 'STAFF_MARKED' },
    ]);
    await fixture.whenStable();

    expect(text('oc-stat-walkins')).toBe('1');
    expect(text('oc-stat-booked')).toBe('1'); // not re-read: httpMock.verify() fails on a stray GET
  });

  it('ignores a change for another day or another venue (#1525 AC-4)', async () => {
    await render(venueMap([set(1, 'FREE')]), 0, TAKINGS, [{ setId: 9, state: 'STAFF_MARKED' }]);

    TestBed.inject(AvailabilityChanges).announce({
      venueId: VENUE,
      date: addDays(todayBookingDate(new Date()), 1),
    });
    TestBed.inject(AvailabilityChanges).announce({
      venueId: 2,
      date: todayBookingDate(new Date()),
    });
    await fixture.whenStable();

    httpMock.expectNone((r) => r.url === HELD_URL);
    expect(text('oc-stat-walkins')).toBe('1');
  });

  it('degrades walk-ins to a dash when the refresh read fails — never the pre-write count (#1525 AC-5)', async () => {
    await render(venueMap([set(1, 'FREE')]), 0, TAKINGS, [{ setId: 9, state: 'STAFF_MARKED' }]);

    TestBed.inject(AvailabilityChanges).announce({
      venueId: VENUE,
      date: todayBookingDate(new Date()),
    });
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.url === HELD_URL && r.method === 'GET')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(text('oc-stat-walkins')).toBe('—');
  });

  it('latest read wins when two refreshes overlap — an older answer never lands over a newer one (#1525, R-3)', async () => {
    await render(venueMap([set(1, 'FREE'), set(2, 'FREE')]), 0, TAKINGS, []);
    const today = todayBookingDate(new Date());

    // Two quick taps: two announces, two reads in flight; the first answers last.
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: today });
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: today });
    await fixture.whenStable();
    const [first, second] = httpMock.match((r) => r.url === HELD_URL && r.method === 'GET');
    second.flush([
      { setId: 1, state: 'STAFF_MARKED' },
      { setId: 2, state: 'STAFF_MARKED' },
    ]);
    await fixture.whenStable();
    expect(text('oc-stat-walkins')).toBe('2');

    first.flush([{ setId: 1, state: 'STAFF_MARKED' }]); // the pre-second-mark truth, late
    await fixture.whenStable();
    expect(text('oc-stat-walkins')).toBe('2');
  });

  it('an older refresh failing late never blanks a newer count (#1525, R-3)', async () => {
    await render(venueMap([set(1, 'FREE')]), 0, TAKINGS, []);
    const today = todayBookingDate(new Date());

    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: today });
    TestBed.inject(AvailabilityChanges).announce({ venueId: VENUE, date: today });
    await fixture.whenStable();
    const [first, second] = httpMock.match((r) => r.url === HELD_URL && r.method === 'GET');
    second.flush([{ setId: 1, state: 'STAFF_MARKED' }]);
    first.flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(text('oc-stat-walkins')).toBe('1');
  });

  it('drops a refresh that lands after a venue switch (#1525, #180)', async () => {
    await render(venueMap([set(1, 'FREE')]), 0, TAKINGS, []);
    TestBed.inject(AvailabilityChanges).announce({
      venueId: VENUE,
      date: todayBookingDate(new Date()),
    });
    await fixture.whenStable();
    const stale = httpMock.expectOne((r) => r.url === HELD_URL && r.method === 'GET');

    fixture.componentRef.setInput('venueId', 2);
    fixture.componentRef.setInput('venue', undefined);
    await fixture.whenStable();
    stale.flush([{ setId: 1, state: 'STAFF_MARKED' }]); // venue 1's late answer
    await fixture.whenStable();
    expect(text('oc-stat-walkins')).toBe('—'); // venue 2's read is still out

    for (const path of ['bookings', 'takings', 'availability']) {
      httpMock
        .expectOne((r) => r.url === `${BASE}/api/venues/2/${path}` && r.method === 'GET')
        .flush(path === 'takings' ? TAKINGS : []);
    }
    await fixture.whenStable();
    expect(text('oc-stat-walkins')).toBe('0');
  });

  it('resets the tiles when the venueId input changes, then loads the new venue (#180)', async () => {
    await render(venueMap([]), 2, TAKINGS);
    expect(text('oc-stat-takings')).toBe('€110');

    // A venue switch reuses the strip — old counts/takings must not render against the new venue.
    fixture.componentRef.setInput('venueId', 2);
    fixture.componentRef.setInput('venue', undefined);
    await fixture.whenStable();
    expect(text('oc-stat-booked')).toBe('—');
    expect(text('oc-stat-takings')).toBe('—');

    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/2/bookings` && r.method === 'GET')
      .flush([{ setId: 1, code: 'X' }]);
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/2/takings` && r.method === 'GET')
      .flush({ ...TAKINGS, gross: { minorUnits: 5000, currency: 'EUR' } });
    httpMock
      .expectOne((r) => r.url === `${BASE}/api/venues/2/availability` && r.method === 'GET')
      .flush([{ setId: 9, state: 'STAFF_MARKED' }]);
    await fixture.whenStable();

    expect(text('oc-stat-booked')).toBe('1');
    expect(text('oc-stat-takings')).toBe('€50');
    expect(text('oc-stat-walkins')).toBe('1');
  });

  it('re-derives today at a venue switch made past Tirane midnight (#572, invariant #6)', async () => {
    await render(venueMap([]), 2, TAKINGS);

    const frozen = new Date();
    // The console was opened before midnight and kept open; the switch happens just after it.
    vi.setSystemTime(new Date(frozen.getTime() + 12 * 60 * 60 * 1000 + 60_000));
    try {
      const today = todayBookingDate(new Date());
      expect(today).not.toBe(todayBookingDate(frozen));

      fixture.componentRef.setInput('venueId', 2);
      fixture.componentRef.setInput('venue', undefined);
      await fixture.whenStable();

      for (const path of ['bookings', 'takings', 'availability']) {
        const req = httpMock.expectOne(
          (r) => r.url === `${BASE}/api/venues/2/${path}` && r.method === 'GET',
        );
        expect(req.request.params.get('date')).toBe(today);
        req.flush(path === 'takings' ? TAKINGS : []);
      }
      await fixture.whenStable();
    } finally {
      vi.setSystemTime(frozen);
    }
  });
});
