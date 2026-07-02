import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { DailyBookingItem, PendingRequestItem, RequestDecision } from './staff.model';
import {
  StaffService,
  staffMarkErrorOf,
  staffReleaseErrorOf,
  staffRequestErrorOf,
} from './staff.service';

const BASE = environment.apiBaseUrl;

describe('StaffService', () => {
  let service: StaffService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StaffService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StaffService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GETs the venue daily bookings with the date param', () => {
    const expected: DailyBookingItem[] = [{ setId: 7, code: 'ABCD2345' }];
    let actual: DailyBookingItem[] | undefined;
    service.dailyBookings(1, '2026-06-30').subscribe((b) => (actual = b));

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/1/bookings` && r.params.get('date') === '2026-06-30',
    );
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('POSTs a mark with the date in the body', () => {
    service.mark(1, 7, '2026-06-30').subscribe();
    const req = httpMock.expectOne(`${BASE}/api/venues/1/sets/7/availability`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ date: '2026-06-30' });
    req.flush({ state: 'STAFF_MARKED' });
  });

  it('DELETEs a release with the date param', () => {
    service.release(1, 7, '2026-06-30').subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/1/sets/7/availability` && r.params.get('date') === '2026-06-30',
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('GETs the venue-wide pending booking requests (issue #98)', () => {
    const expected: PendingRequestItem[] = [
      {
        bookingId: 11,
        setId: 7,
        bookingDate: '2026-07-03',
        guestName: 'Ana Guest',
        amount: { minorUnits: 4500, currency: 'EUR' },
        requestedAt: '2026-07-01T09:00:00Z',
        requestExpiresAt: '2026-07-02T16:00:00Z',
      },
    ];
    let actual: PendingRequestItem[] | undefined;
    service.pendingRequests(1).subscribe((r) => (actual = r));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests`);
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('POSTs an accept with an empty body', () => {
    let actual: RequestDecision | undefined;
    service.acceptRequest(1, 11).subscribe((d) => (actual = d));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests/11/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ bookingId: 11, status: 'AWAITING_PAYMENT' });
    expect(actual).toEqual({ bookingId: 11, status: 'AWAITING_PAYMENT' });
  });

  it('POSTs a decline with an empty body', () => {
    let actual: RequestDecision | undefined;
    service.declineRequest(1, 11).subscribe((d) => (actual = d));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests/11/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ bookingId: 11, status: 'DECLINED' });
    expect(actual).toEqual({ bookingId: 11, status: 'DECLINED' });
  });
});

describe('staffMarkErrorOf', () => {
  it('maps the server error code', () => {
    const err = new HttpErrorResponse({ status: 409, error: { status: 409, code: 'ALREADY_TAKEN' } });
    expect(staffMarkErrorOf(err)).toBe('ALREADY_TAKEN');
  });

  it('maps 401 to UNAUTHORIZED regardless of body', () => {
    expect(staffMarkErrorOf(new HttpErrorResponse({ status: 401 }))).toBe('UNAUTHORIZED');
  });

  it('falls back to UNKNOWN for an unrecognised failure', () => {
    expect(staffMarkErrorOf(new HttpErrorResponse({ status: 500 }))).toBe('UNKNOWN');
    expect(staffMarkErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});

describe('staffReleaseErrorOf', () => {
  it('maps NOT_MARKED and 401', () => {
    expect(staffReleaseErrorOf(new HttpErrorResponse({ status: 409, error: { status: 409, code: 'NOT_MARKED' } }))).toBe(
      'NOT_MARKED',
    );
    expect(staffReleaseErrorOf(new HttpErrorResponse({ status: 401 }))).toBe('UNAUTHORIZED');
  });

  it('falls back to UNKNOWN otherwise', () => {
    expect(staffReleaseErrorOf(new HttpErrorResponse({ status: 500 }))).toBe('UNKNOWN');
  });
});

describe('staffRequestErrorOf', () => {
  function httpError(status: number, code: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: { status, code } });
  }

  it('maps every accept/decline server code', () => {
    expect(staffRequestErrorOf(httpError(404, 'NO_SUCH_REQUEST'))).toBe('NO_SUCH_REQUEST');
    expect(staffRequestErrorOf(httpError(409, 'REQUEST_NOT_PENDING'))).toBe('REQUEST_NOT_PENDING');
    expect(staffRequestErrorOf(httpError(409, 'REQUEST_EXPIRED'))).toBe('REQUEST_EXPIRED');
    expect(staffRequestErrorOf(httpError(502, 'PAYMENT_INIT_FAILED'))).toBe('PAYMENT_INIT_FAILED');
    expect(staffRequestErrorOf(httpError(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
  });

  it('maps 401 to UNAUTHORIZED regardless of body', () => {
    expect(staffRequestErrorOf(new HttpErrorResponse({ status: 401 }))).toBe('UNAUTHORIZED');
  });

  it('falls back to UNKNOWN for unrecognised / non-HTTP failures', () => {
    expect(staffRequestErrorOf(new HttpErrorResponse({ status: 500 }))).toBe('UNKNOWN');
    expect(staffRequestErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});
