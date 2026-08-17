import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CreateVenueRequest } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

const VENUE: CreateVenueRequest = {
  name: 'Sunset Bar',
  beach: 'Ksamil',
  region: 'Riviera',
  description: 'on the shore',
  bookingMode: 'INSTANT',
  payoutCurrency: 'EUR',
  bookingCutoff: '18:00',
};

describe('VenueAdminService', () => {
  let service: VenueAdminService;
  let httpMock: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VenueAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('createVenue POSTs the request body', () => {
    let id: number | undefined;
    service.createVenue(VENUE).subscribe((r) => (id = r.id));
    const req = httpMock.expectOne(`${base}/api/venues`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(VENUE);
    req.flush({ id: 5 }, { status: 201, statusText: 'Created' });
    expect(id).toBe(5);
  });

  it('venueDefaults GETs the platform terms', () => {
    let commissionBps: number | undefined;
    service.venueDefaults().subscribe((d) => (commissionBps = d.commissionBps));
    const req = httpMock.expectOne(`${base}/api/venue-defaults`);
    expect(req.request.method).toBe('GET');
    req.flush({ commissionBps: 500 });
    expect(commissionBps).toBe(500);
  });
});

describe('venueAdminErrorOf', () => {
  /** A realistic RFC-7807 body — the `code` extension carries the identity. */
  function httpError(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      error: code ? { type: 'about:blank', title: 'Error', status, detail: 'why', code } : null,
    });
  }

  it('maps 401 to UNAUTHORIZED', () => {
    expect(venueAdminErrorOf(httpError(401))).toBe('UNAUTHORIZED');
  });

  it('maps known server codes', () => {
    expect(venueAdminErrorOf(httpError(404, 'NO_SUCH_VENUE'))).toBe('NO_SUCH_VENUE');
    expect(venueAdminErrorOf(httpError(400, 'INVALID_REQUEST'))).toBe('INVALID_REQUEST');
  });

  it('falls back to UNKNOWN for unrecognised / non-HTTP errors', () => {
    expect(venueAdminErrorOf(httpError(500))).toBe('UNKNOWN');
    expect(venueAdminErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});
