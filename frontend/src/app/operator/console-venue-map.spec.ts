import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { VenueMapView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';

/**
 * The operator console's shared venue-map snapshot. The shell, the Requests tab and the
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
  let frozenNow: number;

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
    http.expectOne(`${environment.apiBaseUrl}/api/venues/${VENUE}?date=${date}`).flush(body);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    cache = TestBed.inject(ConsoleVenueMap);
    http = TestBed.inject(HttpTestingController);
    frozenNow = Date.now();
  });

  afterEach(() => {
    vi.setSystemTime(new Date(frozenNow)); // the suite-wide frozen clock, restored for the next spec
    http.verify();
  });

  it('coalesces two concurrent loads of the same key into one request', () => {
    const seen: string[] = [];
    cache.load(VENUE, TODAY).subscribe((v) => seen.push(`shell:${v.name}`));
    cache.load(VENUE, TODAY).subscribe((v) => seen.push(`tab:${v.name}`));

    // expectOne fails outright if the second load issued its own request — the point of the cache.
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

  it('does not let a superseded fetch drop the snapshot that replaced it (review F-2)', () => {
    // The key is equal again by the time the orphan fails — only identity separates the two.
    let orphanFailed = false;
    cache.load(VENUE, TODAY).subscribe({ error: () => (orphanFailed = true) });
    cache.reset();
    cache.load(VENUE, TODAY).subscribe();

    const [orphan, current] = http.match(
      `${environment.apiBaseUrl}/api/venues/${VENUE}?date=${TODAY}`,
    );
    current.flush(venueMap('Fresh'));
    orphan.flush('nope', { status: 500, statusText: 'Server Error' });
    expect(orphanFailed).toBe(true);

    let served: string | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (served = v.name));
    expect(served).toBe('Fresh');
    http.expectNone(`${environment.apiBaseUrl}/api/venues/${VENUE}?date=${TODAY}`);
  });

  it('refetches once the snapshot ages out — a tab revisit stays a fresh read (review F-3)', () => {
    cache.load(VENUE, TODAY).subscribe();
    flushMap(TODAY, venueMap('At console open'));

    // A tab is recreated on every navigation, so a revisit always re-read from the server before.
    vi.setSystemTime(new Date(Date.now() + 31_000));

    let revisit: string | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (revisit = v.name));
    flushMap(TODAY, venueMap('Repriced from another device'));

    expect(revisit).toBe('Repriced from another device');
  });

  it('still coalesces two loads inside the snapshot window', () => {
    cache.load(VENUE, TODAY).subscribe();
    vi.setSystemTime(new Date(Date.now() + 5_000)); // the tab route resolves a moment after the shell

    let joined: string | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (joined = v.name));
    flushMap(TODAY, venueMap('One read'));

    expect(joined).toBe('One read');
  });

  it('does not age out a read that is still in flight (review F-6)', () => {
    // The window must start when the data becomes real, not when the request left. A read slower than
    // the TTL is still about to answer, so expiring it would dispatch a second concurrent GET for the
    // same key — the duplicate this cache exists to remove, re-entered through latency.
    cache.load(VENUE, TODAY).subscribe();
    vi.setSystemTime(new Date(Date.now() + 31_000));

    let joined: string | undefined;
    cache.load(VENUE, TODAY).subscribe((v) => (joined = v.name));
    flushMap(TODAY, venueMap('One slow read'));

    expect(joined).toBe('One slow read');
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
