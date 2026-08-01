import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { VenueMapView } from '../venue/venue.model';
import { ConsoleVenueMap } from './console-venue-map';

/**
 * The operator console's shared venue-map snapshot (#486). The shell, the Requests tab and the
 * Pricing tab all want the same `(venue, today)` read, so opening the console on a tab used to fire
 * `GET /api/venues/{id}?date=` twice. This pins the four properties that make sharing safe: identical
 * asks coalesce into one request, a settled snapshot replays, a failure is never retained, and both
 * `reset()` and a changed key send the next caller back to the server.
 */
describe('ConsoleVenueMap (#486)', () => {
  const VENUE = 1;
  const TODAY = '2026-06-15';

  let cache: ConsoleVenueMap;
  let http: HttpTestingController;

  function venueMap(name = 'Miramar Beach Club'): VenueMapView {
    return {
      id: VENUE,
      name,
      beach: 'Ksamil',
      region: 'Albanian Riviera',
      description: 'Loungers on the shore.',
      ratingTenths: 48,
      reviewsCount: 12,
      bookingMode: 'REQUEST',
      fromPrice: { minorUnits: 4500, currency: 'EUR' },
      sets: [],
      setVersion: 7,
      coverPhoto: null,
    };
  }

  /** Assert exactly one map request is outstanding for `date`, and answer it. */
  function flushMap(date: string, body: VenueMapView): void {
    http
      .expectOne(`${environment.apiBaseUrl}/api/venues/${VENUE}?date=${date}`)
      .flush(body);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    cache = TestBed.inject(ConsoleVenueMap);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('coalesces two concurrent loads of the same key into one request', () => {
    const seen: string[] = [];
    cache.load(VENUE, TODAY).subscribe((v) => seen.push(`shell:${v.name}`));
    cache.load(VENUE, TODAY).subscribe((v) => seen.push(`tab:${v.name}`));

    // expectOne fails outright if the second load issued its own request — the point of the slice.
    flushMap(TODAY, venueMap());

    expect(seen).toEqual(['shell:Miramar Beach Club', 'tab:Miramar Beach Club']);
  });

  it('replays the settled snapshot to a caller that arrives later', () => {
    cache.load(VENUE, TODAY).subscribe();
    flushMap(TODAY, venueMap());

    let replayed: VenueMapView | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (replayed = v));

    expect(replayed?.setVersion).toBe(7);
    http.expectNone(`${environment.apiBaseUrl}/api/venues/${VENUE}?date=${TODAY}`);
  });

  it('does not retain a failure — the next caller retries against the server', () => {
    let failed = false;
    cache.load(VENUE, TODAY).subscribe({ error: () => (failed = true) });
    http
      .expectOne(`${environment.apiBaseUrl}/api/venues/${VENUE}?date=${TODAY}`)
      .flush('nope', { status: 500, statusText: 'Server Error' });
    expect(failed).toBe(true);

    let recovered: VenueMapView | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (recovered = v));
    flushMap(TODAY, venueMap('Recovered'));

    expect(recovered?.name).toBe('Recovered');
  });

  it('refetches after reset — the invalidation edge a layout or pricing save uses', () => {
    cache.load(VENUE, TODAY).subscribe();
    flushMap(TODAY, venueMap('Before the save'));

    cache.reset();

    let after: VenueMapView | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (after = v));
    flushMap(TODAY, venueMap('After the save'));

    expect(after?.name).toBe('After the save');
  });

  it('refetches when the key changes — a venue switch or a date rollover evicts the slot', () => {
    cache.load(VENUE, TODAY).subscribe();
    flushMap(TODAY, venueMap());

    cache.load(VENUE, '2026-06-16').subscribe();
    flushMap('2026-06-16', venueMap());

    // ...and the evicted key is genuinely gone, not still parked in a second slot.
    cache.load(VENUE, TODAY).subscribe();
    flushMap(TODAY, venueMap());
  });
});
