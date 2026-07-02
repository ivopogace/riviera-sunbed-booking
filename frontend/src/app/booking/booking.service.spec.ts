import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingDetail,
  Cancellation,
  CreateBookingRequest,
  CreateBookingResult,
  PaymentHandoff,
  RequestedBooking,
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

const AWAITING: AwaitingPayment = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  clientSecret: 'pi_123_secret_abc',
  paymentIntentId: 'pi_123',
};

const REQUESTED: RequestedBooking = {
  code: 'RQST234567',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: '2026-11-30T16:00:00Z',
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

  it('POSTs the request and exposes a confirmed result for a 201 (stub profile)', () => {
    let received: CreateBookingResult | undefined;
    service.createBooking(REQUEST).subscribe((r) => (received = r));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REQUEST);
    req.flush(CONFIRMATION, { status: 201, statusText: 'Created' });

    expect(received).toEqual({ kind: 'confirmed', confirmation: CONFIRMATION });
    expect(service.lastConfirmation()).toEqual(CONFIRMATION);
    expect(service.lastAwaitingPayment()).toBeUndefined();
  });

  it('exposes an awaiting-payment result for a 202 and stores the handoff (stripe profile)', () => {
    let received: CreateBookingResult | undefined;
    service.createBooking(REQUEST).subscribe((r) => (received = r));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
    req.flush(AWAITING, { status: 202, statusText: 'Accepted' });

    expect(received).toEqual({ kind: 'awaiting', awaiting: AWAITING });
    expect(service.lastAwaitingPayment()).toEqual(AWAITING);
    expect(service.lastConfirmation()).toBeUndefined();
  });

  it('exposes a requested result for a 202 PENDING_REQUEST body (REQUEST-mode venue, #98)', () => {
    let received: CreateBookingResult | undefined;
    service.createBooking(REQUEST).subscribe((r) => (received = r));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
    req.flush(REQUESTED, { status: 202, statusText: 'Accepted' });

    // Same HTTP status as the stripe path — the body's status discriminates (no clientSecret here).
    expect(received).toEqual({ kind: 'requested', requested: REQUESTED });
    expect(service.lastRequested()).toEqual(REQUESTED);
    expect(service.lastAwaitingPayment()).toBeUndefined();
    expect(service.lastConfirmation()).toBeUndefined();
  });

  it('beginPayment primes the payment hand-off from a fetched booking detail (#98 Pay now)', () => {
    // A stale request hand-off must not survive into the payment flow.
    service.createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush(REQUESTED, { status: 202, statusText: 'Accepted' });

    const handoff: PaymentHandoff = {
      code: 'RQST234567',
      venueName: 'Miramar Beach Club',
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      bookingDate: '2026-12-01',
      amount: { minorUnits: 4500, currency: 'EUR' },
      clientSecret: 'pi_9_secret_x',
      paymentIntentId: 'pi_9',
    };
    service.beginPayment(handoff);

    expect(service.lastAwaitingPayment()).toEqual(handoff);
    expect(service.lastRequested()).toBeUndefined();
    expect(service.lastConfirmation()).toBeUndefined();
  });

  it('clear() resets all handoffs', () => {
    service.createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/bookings`)
      .flush(REQUESTED, { status: 202, statusText: 'Accepted' });
    service.clear();
    expect(service.lastConfirmation()).toBeUndefined();
    expect(service.lastAwaitingPayment()).toBeUndefined();
    expect(service.lastRequested()).toBeUndefined();
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
      requestExpiresAt: null,
      payment: null,
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
  /** A realistic RFC-7807 body (issue #97) — the `code` extension carries the identity. */
  function httpError(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      error: code ? { type: 'about:blank', title: 'Error', status, detail: 'why', code } : null,
    });
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
