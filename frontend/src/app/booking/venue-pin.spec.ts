import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { VenuePin } from './venue-pin';

const PIN = { latitude: 39.774531, longitude: 19.998412 };

describe('VenuePin', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function settle(): Promise<void> {
    return TestBed.inject(ApplicationRef).whenStable();
  }

  function pinOf(venueId: () => number | undefined) {
    return TestBed.runInInjectionContext(() => TestBed.inject(VenuePin).locationOf(venueId));
  }

  it('answers the pin the public venue read carries', async () => {
    const pin = pinOf(() => 7);
    TestBed.tick();
    expect(pin()).toBeNull();

    http.expectOne(`${environment.apiBaseUrl}/api/venues/7`).flush({ id: 7, location: PIN });
    await settle();
    expect(pin()).toEqual(PIN);
  });

  it('answers null for a venue with no pin', async () => {
    const pin = pinOf(() => 7);
    TestBed.tick();
    http.expectOne(`${environment.apiBaseUrl}/api/venues/7`).flush({ id: 7, location: null });
    await settle();
    expect(pin()).toBeNull();
  });

  it('answers null when the read fails, as for a venue hidden from tourists', async () => {
    const pin = pinOf(() => 7);
    TestBed.tick();
    http
      .expectOne(`${environment.apiBaseUrl}/api/venues/7`)
      .flush({ code: 'NO_SUCH_VENUE' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(pin()).toBeNull();
  });

  it('reads nothing until there is a venue, then follows it', async () => {
    const venueId = signal<number | undefined>(undefined);
    const pin = pinOf(venueId);
    TestBed.tick();
    http.expectNone(() => true);

    venueId.set(3);
    TestBed.tick();
    http.expectOne(`${environment.apiBaseUrl}/api/venues/3`).flush({ id: 3, location: PIN });
    await settle();
    expect(pin()).toEqual(PIN);
  });
});
