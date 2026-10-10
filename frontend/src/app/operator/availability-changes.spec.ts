import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { todayBookingDate } from '../shared/booking-date';
import { AvailabilityChange, AvailabilityChanges } from './availability-changes';
import { ConsoleVenueMap } from './console-venue-map';

/**
 * The carrier between the Daily view's successful walk-in mark/release and the console surfaces
 * that count today (#1525): an announced change drops the shared snapshot, then reaches whoever is
 * listening — and only them, a late subscriber must not refetch on a mark that already happened.
 */
describe('AvailabilityChanges (#1525)', () => {
  const VENUE = 1;
  const TODAY = todayBookingDate(new Date());
  const MAP_URL = `${environment.apiBaseUrl}/api/venues/${VENUE}?date=${TODAY}`;

  let changes: AvailabilityChanges;
  let snapshot: ConsoleVenueMap;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    changes = TestBed.inject(AvailabilityChanges);
    snapshot = TestBed.inject(ConsoleVenueMap);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('drops the shared snapshot, so the next load of the same key hits the server (AC-7)', () => {
    snapshot.load(VENUE, TODAY).subscribe();
    http.expectOne(MAP_URL).flush({ id: VENUE, name: 'Miramar', sets: [] });

    changes.announce({ venueId: VENUE, date: TODAY });

    snapshot.load(VENUE, TODAY).subscribe();
    http.expectOne(MAP_URL).flush({ id: VENUE, name: 'Miramar', sets: [] });
  });

  it('reaches a live subscriber and never a late one (AC-7)', () => {
    const seen: AvailabilityChange[] = [];
    changes.changes.subscribe((c) => seen.push(c));

    changes.announce({ venueId: VENUE, date: TODAY });

    const late: AvailabilityChange[] = [];
    changes.changes.subscribe((c) => late.push(c));
    expect(seen).toEqual([{ venueId: VENUE, date: TODAY }]);
    expect(late).toEqual([]);
  });

  it('todayAt passes only the venue’s changes dated today, as of the moment they land (#6)', () => {
    const venueId = signal(VENUE);
    const seen: AvailabilityChange[] = [];
    changes.todayAt(venueId).subscribe((c) => seen.push(c));

    changes.announce({ venueId: 2, date: TODAY });
    changes.announce({ venueId: VENUE, date: '2026-06-16' });
    changes.announce({ venueId: VENUE, date: TODAY });

    expect(seen).toEqual([{ venueId: VENUE, date: TODAY }]);

    // After an in-place venue switch only the current venue's changes pass.
    venueId.set(2);
    changes.announce({ venueId: VENUE, date: TODAY });
    changes.announce({ venueId: 2, date: TODAY });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ venueId: 2, date: TODAY });
  });

  it('todayAt re-derives today per change: past Tirane midnight, yesterday’s mark is not today’s (#6)', () => {
    const frozen = new Date();
    const seen: AvailabilityChange[] = [];
    changes.todayAt(signal(VENUE)).subscribe((c) => seen.push(c));
    vi.setSystemTime(new Date(frozen.getTime() + 12 * 60 * 60 * 1000 + 60_000));
    try {
      const tomorrow = todayBookingDate(new Date());
      expect(tomorrow).not.toBe(TODAY);

      changes.announce({ venueId: VENUE, date: TODAY });
      changes.announce({ venueId: VENUE, date: tomorrow });

      expect(seen).toEqual([{ venueId: VENUE, date: tomorrow }]);
    } finally {
      vi.setSystemTime(frozen);
    }
  });
});
