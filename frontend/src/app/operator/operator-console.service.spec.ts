import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  PayoutLedgerView,
  PendingRequestItem,
  RequestDecision,
  WeatherRefundResult,
} from './operator-console.model';
import {
  OperatorConsoleService,
  markErrorOf,
  payoutErrorOf,
  releaseErrorOf,
  requestErrorOf,
} from './operator-console.service';

const BASE = environment.apiBaseUrl;

/**
 * The Daily-view walk-in mark/release error mappers. They narrow an HTTP failure's RFC-7807
 * `code` — or a 401 / non-HTTP failure — to the displayable union each surface maps to
 * operator copy. Pure functions; exhaustively covered here.
 */
describe('operator-console mark/release error mappers (#175)', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  describe('markErrorOf', () => {
    it('maps 401 to UNAUTHORIZED before reading the body', () => {
      expect(markErrorOf(problem(401, 'ANYTHING'))).toBe('UNAUTHORIZED');
    });

    it('passes through the known problem codes', () => {
      for (const code of [
        'ALREADY_TAKEN',
        'DATE_IN_PAST',
        'NO_SUCH_SET',
        'NO_SUCH_VENUE',
        'NOT_VENUE_OWNER',
        'INVALID_REQUEST',
      ]) {
        expect(markErrorOf(problem(409, code))).toBe(code);
      }
    });

    it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
      expect(markErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
      expect(markErrorOf(problem(500))).toBe('UNKNOWN');
      expect(markErrorOf(new Error('boom'))).toBe('UNKNOWN');
    });
  });

  describe('releaseErrorOf', () => {
    it('maps 401 to UNAUTHORIZED', () => {
      expect(releaseErrorOf(problem(401))).toBe('UNAUTHORIZED');
    });

    it('passes through NOT_MARKED and NOT_VENUE_OWNER', () => {
      expect(releaseErrorOf(problem(409, 'NOT_MARKED'))).toBe('NOT_MARKED');
      expect(releaseErrorOf(problem(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
    });

    it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
      expect(releaseErrorOf(problem(409, 'WHATEVER'))).toBe('UNKNOWN');
      expect(releaseErrorOf('not an http error')).toBe('UNKNOWN');
    });
  });

  describe('requestErrorOf (accept/decline, #176)', () => {
    it('maps 401 to UNAUTHORIZED before reading the body', () => {
      expect(requestErrorOf(problem(401, 'ANYTHING'))).toBe('UNAUTHORIZED');
    });

    it('passes through every known accept/decline code', () => {
      for (const code of [
        'NO_SUCH_REQUEST',
        'REQUEST_NOT_PENDING',
        'REQUEST_EXPIRED',
        'PAYMENT_INIT_FAILED',
        'NOT_VENUE_OWNER',
      ]) {
        expect(requestErrorOf(problem(409, code))).toBe(code);
      }
    });

    it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
      expect(requestErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
      expect(requestErrorOf(new Error('boom'))).toBe('UNKNOWN');
    });
  });
});

/**
 * The Request-to-Book client on the console service: the queue read, accept, decline,
 * and the badge count that reuses the same read. Owner-asserted server-side (invariant #13); the queue
 * carries no booking code (invariant #7).
 */
describe('OperatorConsoleService — Request-to-Book client (#176)', () => {
  let service: OperatorConsoleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OperatorConsoleService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperatorConsoleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const REQUEST: PendingRequestItem = {
    bookingId: 11,
    setId: 7,
    bookingDate: '2026-07-03',
    guestName: 'Ana Guest',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestedAt: '2026-07-01T09:00:00Z',
    requestExpiresAt: '2026-07-02T16:00:00Z',
  };

  it('GETs the venue-wide pending booking requests', () => {
    let actual: PendingRequestItem[] | undefined;
    service.pendingRequests(1).subscribe((r) => (actual = r));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests`);
    expect(req.request.method).toBe('GET');
    req.flush([REQUEST]);
    expect(actual).toEqual([REQUEST]);
  });

  it('derives the badge count from the same requests read', () => {
    let actual: number | undefined;
    service.pendingRequestCount(1).subscribe((n) => (actual = n));

    httpMock.expectOne(`${BASE}/api/venues/1/booking-requests`).flush([REQUEST, { ...REQUEST, bookingId: 12 }]);
    expect(actual).toBe(2);
  });

  it('POSTs an accept with an empty body and returns the decision', () => {
    let actual: RequestDecision | undefined;
    service.acceptRequest(1, 11).subscribe((d) => (actual = d));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests/11/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ bookingId: 11, status: 'AWAITING_PAYMENT' });
    expect(actual).toEqual({ bookingId: 11, status: 'AWAITING_PAYMENT' });
  });

  it('POSTs a decline with an empty body and returns the decision', () => {
    let actual: RequestDecision | undefined;
    service.declineRequest(1, 11).subscribe((d) => (actual = d));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/booking-requests/11/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ bookingId: 11, status: 'DECLINED' });
    expect(actual).toEqual({ bookingId: 11, status: 'DECLINED' });
  });
});

/**
 * The Payouts-tab error mapper — one mapper for both the ledger read and the weather refund,
 * because their meaningful failure surface is identical (403 owner / 401 session / else). Narrows the
 * RFC-7807 `code` or a 401 to the union the tab maps to operator copy. Pure; covered here.
 */
describe('payoutErrorOf (ledger read + weather refund, #173)', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  it('maps 401 to UNAUTHORIZED before reading the body', () => {
    expect(payoutErrorOf(problem(401, 'ANYTHING'))).toBe('UNAUTHORIZED');
  });

  it('maps 403 NOT_VENUE_OWNER to the owner code (invariant #13)', () => {
    expect(payoutErrorOf(problem(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
  });

  it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
    expect(payoutErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
    expect(payoutErrorOf(problem(500))).toBe('UNKNOWN');
    expect(payoutErrorOf(new Error('boom'))).toBe('UNKNOWN');
  });
});

/**
 * The payout client on the console service: the per-venue ledger read and the per-date
 * weather refund — both existing, owner-asserted endpoints (invariant #13). Money is integer minor
 * units (invariant #5); the ledger carries only `bookingId`, never a code or guest identity
 * (invariants #7/#11).
 */
describe('OperatorConsoleService — payout ledger + weather refund (#173)', () => {
  let service: OperatorConsoleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OperatorConsoleService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperatorConsoleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const LEDGER: PayoutLedgerView = {
    venueId: 1,
    currency: 'EUR',
    netOwedMinor: 5950,
    entries: [
      {
        type: 'ACCRUAL',
        bookingId: 11,
        grossMinor: 4500,
        commissionMinor: 675,
        netMinor: 3825,
        currency: 'EUR',
        reason: null,
        createdAt: '2026-07-01T09:00:00Z',
        runningNetMinor: 3825,
      },
      {
        type: 'REVERSAL',
        bookingId: 12,
        grossMinor: 2500,
        commissionMinor: 375,
        netMinor: 2125,
        currency: 'EUR',
        reason: 'WEATHER',
        createdAt: '2026-07-02T09:00:00Z',
        runningNetMinor: 1700,
      },
    ],
  };

  it('GETs the per-venue payout ledger', () => {
    let actual: PayoutLedgerView | undefined;
    service.payoutLedger(1).subscribe((l) => (actual = l));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/payout-ledger`);
    expect(req.request.method).toBe('GET');
    req.flush(LEDGER);
    expect(actual).toEqual(LEDGER);
  });

  it('POSTs a weather refund with the date as a query param (no implicit today)', () => {
    let actual: WeatherRefundResult | undefined;
    service.weatherRefund(1, '2026-07-05').subscribe((r) => (actual = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/venues/1/weather-refund` && r.method === 'POST',
    );
    expect(req.request.params.get('date')).toBe('2026-07-05');
    req.flush({ refundedCount: 2, totalRefundedMinor: 7000, currency: 'EUR' });
    expect(actual).toEqual({ refundedCount: 2, totalRefundedMinor: 7000, currency: 'EUR' });
  });
});
