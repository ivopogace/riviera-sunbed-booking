import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { environment } from '../../environments/environment';
import { routes } from '../app.routes';
import { VenueMap } from './venue-map';

const BASE = environment.apiBaseUrl;
const FALLBACK = 'Beach map — Riviera';

/** The tourist venue page's document title over the real routes and the default title strategy (#1733). */
describe('Tourist venue page title (#1733)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let titleBefore: string;

  beforeEach(async () => {
    titleBefore = document.title;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.match((req) => req.url.endsWith('/reviews'));
    http.verify();
    document.title = titleBefore;
  });

  function venueRequest(id: number) {
    return http.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/api/venues/${id}`);
  }

  function flushVenue(id: number, name: string): void {
    venueRequest(id).flush({
      id,
      name,
      beach: 'KSAMIL',
      region: 'SARANDE',
      description: '',
      ratingTenths: 40,
      reviewsCount: 1,
      bookingMode: 'INSTANT',
      fromPrice: null,
      sets: [],
    });
    harness.fixture.detectChanges();
  }

  async function open(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
  }

  it('keeps the static fallback while the venue read is loading', async () => {
    await open('/venues/1');

    expect(document.title).toBe(FALLBACK);
    venueRequest(1);
  });

  it('names the venue and its beach once the read answers', async () => {
    await open('/venues/1');
    flushVenue(1, 'Miramar Beach Club');

    expect(document.title).toBe('Miramar Beach Club, Ksamil — Riviera');
  });

  it('keeps the static fallback when the read fails', async () => {
    await open('/venues/1');
    venueRequest(1).flush(null, { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();

    expect(document.title).toBe(FALLBACK);
  });

  it('keeps the static fallback when the venue is not found', async () => {
    await open('/venues/1');
    venueRequest(1).flush(null, { status: 404, statusText: 'Not Found' });
    harness.fixture.detectChanges();

    expect(document.title).toBe(FALLBACK);
  });

  it('follows a venue → venue navigation, through the fallback while the next read loads', async () => {
    await open('/venues/1');
    flushVenue(1, 'First Venue');

    await open('/venues/2');
    expect(document.title).toBe(FALLBACK);

    flushVenue(2, 'Second Venue');
    expect(document.title).toBe('Second Venue, Ksamil — Riviera');
  });

  it('keeps the venue title across a date change, the reload included', async () => {
    await open('/venues/1');
    flushVenue(1, 'First Venue');

    const map = harness.fixture.debugElement.query(By.directive(VenueMap))
      .componentInstance as unknown as { onDateChange(value: string): void };
    map.onDateChange('2026-06-20');
    harness.fixture.detectChanges();
    expect(document.title).toBe('First Venue, Ksamil — Riviera');

    flushVenue(1, 'First Venue');
    expect(document.title).toBe('First Venue, Ksamil — Riviera');
  });
});
