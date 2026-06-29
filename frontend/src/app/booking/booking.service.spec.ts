import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { BookingConfirmation, CreateBookingRequest } from './booking.model';
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
