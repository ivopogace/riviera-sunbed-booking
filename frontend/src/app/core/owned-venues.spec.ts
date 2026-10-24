import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OwnedVenues } from './owned-venues';

const MINE = `${environment.apiBaseUrl}/api/venues/mine`;

const VENUES = [
  { id: 12, name: 'Miramar Beach Club', beach: 'DHERMI' },
  { id: 15, name: 'Sereno', beach: 'JALE' },
];

describe('OwnedVenues', () => {
  let http: HttpTestingController;
  let service: OwnedVenues;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OwnedVenues);
  });

  afterEach(() => http.verify());

  it('loads the signed-in operator’s venues and exposes them as a signal', async () => {
    const loading = service.load();
    http.expectOne({ method: 'GET', url: MINE }).flush(VENUES);

    expect(await loading).toEqual({ status: 'loaded', venues: VENUES });
    expect(service.venues()).toEqual(VENUES);
  });

  it('owning nothing is an empty list, not a failure', async () => {
    const loading = service.load();
    http.expectOne(MINE).flush([]);

    expect(await loading).toEqual({ status: 'loaded', venues: [] });
  });

  it('caches, so concurrent callers share one request', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne(MINE).flush(VENUES); // expectOne fails the test if a second GET was issued

    expect(await first).toEqual(await second);

    // A later call is served from the cache — still no second request (http.verify() would fail).
    expect(await service.load()).toEqual({ status: 'loaded', venues: VENUES });
  });

  it('reports an error instead of an empty list when the read fails', async () => {
    // A transient failure must NOT look like "owns no venues" (that forwards to onboarding).
    const loading = service.load();
    http.expectOne(MINE).flush(null, { status: 500, statusText: 'Server Error' });

    expect(await loading).toEqual({ status: 'error' });
    expect(service.venues()).toBeUndefined();
  });

  it('retries after a failure rather than caching it', async () => {
    const failed = service.load();
    http.expectOne(MINE).flush(null, { status: 500, statusText: 'Server Error' });
    await failed;

    const retried = service.load();
    http.expectOne(MINE).flush(VENUES);

    expect(await retried).toEqual({ status: 'loaded', venues: VENUES });
  });

  it('forgets everything on reset, so the next operator never sees the previous one’s venues', async () => {
    const loading = service.load();
    http.expectOne(MINE).flush(VENUES);
    await loading;

    service.reset();

    expect(service.venues()).toBeUndefined();
    const reloaded = service.load();
    http.expectOne(MINE).flush([{ id: 20, name: 'Aurora', beach: 'BORSH' }]);
    expect(await reloaded).toEqual({
      status: 'loaded',
      venues: [{ id: 20, name: 'Aurora', beach: 'BORSH' }],
    });
  });

  it('a read that settles after reset never writes the list — the previous operator’s venues stay gone (#1573, #1623)', async () => {
    const superseded = service.load();
    const pending = http.expectOne(MINE);

    service.reset();
    pending.flush(VENUES);

    // Its caller gets no list either: it would route or render the previous session's venues.
    expect(await superseded).toEqual({ status: 'error' });
    expect(service.venues()).toBeUndefined();
    const reloaded = service.load();
    http.expectOne(MINE).flush([]);
    expect(await reloaded).toEqual({ status: 'loaded', venues: [] });
  });

  it('a read that fails after reset leaves the replacement read in flight (#1573)', async () => {
    const superseded = service.load();
    service.reset();
    const current = service.load();
    const [stale, fresh] = http.match(MINE);

    stale.flush(null, { status: 500, statusText: 'Server Error' });
    await superseded;
    const joined = service.load(); // still shares the replacement — no third GET (http.verify())
    fresh.flush(VENUES);

    expect(await current).toEqual({ status: 'loaded', venues: VENUES });
    expect(await joined).toEqual({ status: 'loaded', venues: VENUES });
    expect(service.venues()).toEqual(VENUES);
  });
});
