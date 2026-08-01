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

/**
 * The #499 integration proof, on the REAL route config: `/venues/1` → `/venues/2` REUSES the
 * `VenueMap` instance (same route config, only the param differs — the router never
 * re-constructs), and the reactive `:id` signal still re-loads the map for venue 2. This is the
 * exact navigation a future "similar venues nearby" link would perform; the unit specs push
 * params through a mocked route, so only this harness spec would catch a regression in how the
 * real router delivers an in-place param change. Mirrors `operator/console-venue-switch.spec.ts`.
 */
describe('Tourist beach map — in-place venue switch over the real routes (#499)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  function flushVenue(id: number, name: string): void {
    http.expectOne((r) => r.method === 'GET' && r.url === `${BASE}/api/venues/${id}`).flush({
      id,
      name,
      beach: 'Ksamil',
      region: 'Riviera',
      description: '',
      ratingTenths: 40,
      reviewsCount: 1,
      bookingMode: 'INSTANT',
      fromPrice: null,
      sets: [],
    });
  }

  function map(): VenueMap {
    return harness.fixture.debugElement.query(By.directive(VenueMap)).componentInstance as VenueMap;
  }

  function header(): string {
    return (
      (harness.fixture.nativeElement as HTMLElement).querySelector('header')?.textContent ?? ''
    );
  }

  it('reuses the map instance yet re-loads for the new venue', async () => {
    await harness.navigateByUrl('/venues/1');
    await harness.fixture.whenStable();
    flushVenue(1, 'First Venue');
    harness.fixture.detectChanges();

    expect(header()).toContain('First Venue');
    const firstInstance = map();

    await harness.navigateByUrl('/venues/2');
    await harness.fixture.whenStable();
    flushVenue(2, 'Second Venue');
    harness.fixture.detectChanges();

    // The regression class #499 closes: the router REUSED the instance (no re-construction)…
    expect(map()).toBe(firstInstance);
    // …and the reactive param still re-loaded the map for venue 2.
    expect(header()).toContain('Second Venue');
  });
});
