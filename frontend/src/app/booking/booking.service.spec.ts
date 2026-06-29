import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  BookingConfirmation,
  BookingDetail,
  Cancellation,
  CreateBookingRequest,
} from './booking.model';
import { BookingService, bookingErrorOf } from './booking.service';

const REQUEST: CreateBookingRequest = {
  setId: 2,
  bookingDate: '2026-12-01',
  contact: { email: 'a@b.com', fullName: 'Ana', phone: '+355600' },
};

const CONFIRMATION: BookingConfirmation = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
};

describe('BookingService', () => {
  let service: BookingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs the request and exposes the confirmation', () => {
    let received: BookingConfirmation | undefined;
    service.createBooking(REQUEST).subscribe((c) => (received = c));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REQUEST);
    req.flush(CONFIRMATION);

    expect(received).toEqual(CONFIRMATION);
    expect(service.lastConfirmation()).toEqual(CONFIRMATION);
  });

  it('clear() resets the last confirmation', () => {
    service.createBooking(REQUEST).subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`).flush(CONFIRMATION);
    service.clear();
    expect(service.lastConfirmation()).toBeUndefined();
  });

  it('getByCode GETs the booking by code', () => {
    const detail: BookingDetail = {
      code: 'ABCD234567',
      status: 'CONFIRMED',
      venueId: 1,
      venueName: 'Miramar Beach Club',
      rowLabel: 'A',
      positionNo: 2,
      bookingDate: '2026-12-01',
      amount: { minorUnits: 4500, currency: 'EUR' },
      cancellable: true,
      beforeCutoff: true,
      refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
      refundedAmount: null,
    };
    let received: BookingDetail | undefined;
    service.getByCode('ABCD234567').subscribe((d) => (received = d));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings/ABCD234567`);
    expect(req.request.method).toBe('GET');
    req.flush(detail);
    expect(received).toEqual(detail);
  });

  it('cancel POSTs to the cancel endpoint with no body-supplied amount', () => {
    const cancellation: Cancellation = {
      code: 'ABCD234567',
      status: 'CANCELLED',
      refund: { minorUnits: 4500, currency: 'EUR' },
      tier: 'FULL',
    };
    let received: Cancellation | undefined;
    service.cancel('ABCD234567').subscribe((c) => (received = c));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings/ABCD234567/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({}); // amount is server-computed (invariant #10)
    req.flush(cancellation);
    expect(received).toEqual(cancellation);
  });
});

describe('bookingErrorOf', () => {
  function httpError(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { error: code } : null });
  }

  it('maps known server codes', () => {
    expect(bookingErrorOf(httpError(409, 'SET_TAKEN'))).toBe('SET_TAKEN');
    expect(bookingErrorOf(httpError(422, 'BOOKING_CLOSED'))).toBe('BOOKING_CLOSED');
    expect(bookingErrorOf(httpError(422, 'SET_NOT_BOOKABLE_ONLINE'))).toBe('SET_NOT_BOOKABLE_ONLINE');
    expect(bookingErrorOf(httpError(404, 'NO_SUCH_SET'))).toBe('NO_SUCH_SET');
    expect(bookingErrorOf(httpError(400, 'INVALID_REQUEST'))).toBe('INVALID_REQUEST');
  });

  it('falls back to UNKNOWN for unrecognised / non-HTTP errors', () => {
    expect(bookingErrorOf(httpError(500))).toBe('UNKNOWN');
    expect(bookingErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});
