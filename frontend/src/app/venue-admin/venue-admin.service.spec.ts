import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CreateVenueRequest, SetPositionRequest } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

const VENUE: CreateVenueRequest = {
  name: 'Sunset Bar',
  beach: 'Ksamil',
  region: 'Riviera',
  description: 'on the shore',
  bookingMode: 'INSTANT',
  commissionBps: 1500,
  payoutCurrency: 'EUR',
  bookingCutoff: '18:00',
};

const SET: SetPositionRequest = {
  rowLabel: 'Front row',
  positionNo: 1,
  tier: 'PREMIUM',
  pool: 'ONLINE',
  price: { minorUnits: 4500, currency: 'EUR' },
  gridX: 1,
  gridY: 1,
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

  it('addSet POSTs to the venue sets endpoint', () => {
    let id: number | undefined;
    service.addSet(5, SET).subscribe((r) => (id = r.id));
    const req = httpMock.expectOne(`${base}/api/venues/5/sets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(SET);
    req.flush({ id: 9 }, { status: 201, statusText: 'Created' });
    expect(id).toBe(9);
  });

  it('updateSet PATCHes the specific set', () => {
    service.updateSet(5, 9, SET).subscribe();
    const req = httpMock.expectOne(`${base}/api/venues/5/sets/9`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(SET);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('removeSet DELETEs the specific set', () => {
    service.removeSet(5, 9).subscribe();
    const req = httpMock.expectOne(`${base}/api/venues/5/sets/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

describe('venueAdminErrorOf', () => {
  function httpError(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { error: code } : null });
  }

  it('maps 401 to UNAUTHORIZED', () => {
    expect(venueAdminErrorOf(httpError(401))).toBe('UNAUTHORIZED');
  });

  it('maps known server codes', () => {
    expect(venueAdminErrorOf(httpError(409, 'CELL_TAKEN'))).toBe('CELL_TAKEN');
    expect(venueAdminErrorOf(httpError(409, 'DUPLICATE_POSITION'))).toBe('DUPLICATE_POSITION');
    expect(venueAdminErrorOf(httpError(409, 'LAYOUT_CONFLICT'))).toBe('LAYOUT_CONFLICT');
    expect(venueAdminErrorOf(httpError(404, 'NO_SUCH_VENUE'))).toBe('NO_SUCH_VENUE');
    expect(venueAdminErrorOf(httpError(404, 'NO_SUCH_SET'))).toBe('NO_SUCH_SET');
    expect(venueAdminErrorOf(httpError(400, 'INVALID_REQUEST'))).toBe('INVALID_REQUEST');
  });

  it('falls back to UNKNOWN for unrecognised / non-HTTP errors', () => {
    expect(venueAdminErrorOf(httpError(500))).toBe('UNKNOWN');
    expect(venueAdminErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});
