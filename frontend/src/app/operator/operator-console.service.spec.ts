import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  PayoutLedgerView,
  PendingRequestItem,
  RequestDecision,
  SetWriteRequest,
  WeatherRefundResult,
} from './operator-console.model';
import {
  OperatorConsoleService,
  markErrorOf,
  payoutErrorOf,
  releaseErrorOf,
  requestErrorOf,
  checkInErrorOf,
  checkInWrongDateOf,
  setWriteErrorOf,
  rowNameErrorOf,
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

    httpMock
      .expectOne(`${BASE}/api/venues/1/booking-requests`)
      .flush([REQUEST, { ...REQUEST, bookingId: 12 }]);
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

describe('check-in error mapping (#583)', () => {
  function http(status: number, body: unknown): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: body });
  }

  it('maps the RFC-7807 codes the Daily view explains', () => {
    expect(checkInErrorOf(http(409, { code: 'ALREADY_CHECKED_IN' }))).toBe('ALREADY_CHECKED_IN');
    expect(checkInErrorOf(http(409, { code: 'WRONG_SERVICE_DATE' }))).toBe('WRONG_SERVICE_DATE');
    expect(checkInErrorOf(http(404, { code: 'BOOKING_NOT_FOUND' }))).toBe('BOOKING_NOT_FOUND');
    expect(checkInErrorOf(http(403, { code: 'NOT_VENUE_OWNER' }))).toBe('NOT_VENUE_OWNER');
  });

  it('maps 401 to UNAUTHORIZED and everything unrecognized to UNKNOWN', () => {
    expect(checkInErrorOf(http(401, { code: 'UNAUTHENTICATED' }))).toBe('UNAUTHORIZED');
    expect(checkInErrorOf(http(500, { code: 'SOMETHING_ELSE' }))).toBe('UNKNOWN');
    expect(checkInErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });

  it('reads the bookingDate extension only when the problem body really carries one', () => {
    expect(
      checkInWrongDateOf(http(409, { code: 'WRONG_SERVICE_DATE', bookingDate: '2026-08-15' })),
    ).toBe('2026-08-15');
    expect(checkInWrongDateOf(http(409, { code: 'WRONG_SERVICE_DATE' }))).toBeUndefined();
    expect(
      checkInWrongDateOf(http(409, { code: 'WRONG_SERVICE_DATE', bookingDate: 7 })),
    ).toBeUndefined();
    expect(checkInWrongDateOf(new Error('offline'))).toBeUndefined();
  });
});

/**
 * The per-set beach-map write client (#600) — the three U7 endpoints the console had never
 * called. `PATCH` sends the FULL set body (the server rejects a partial one `400`), and none of
 * the three carries an `expectedVersion`: they do not participate in the `set_version` token.
 */
describe('OperatorConsoleService — per-set beach-map writes (#600)', () => {
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

  const SET: SetWriteRequest = {
    rowLabel: 'B',
    positionNo: 3,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX: 3,
    gridY: 2,
  };

  it('POSTs a new set and returns the created id', () => {
    let actual: { id: number } | undefined;
    service.addSet(1, SET).subscribe((created) => (actual = created));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/sets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(SET);
    req.flush({ id: 42 });
    expect(actual).toEqual({ id: 42 });
  });

  it('PATCHes one set by id with the whole body, never a partial one', () => {
    service.editSet(1, 42, SET).subscribe();

    const req = httpMock.expectOne(`${BASE}/api/venues/1/sets/42`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(SET);
    expect(req.request.body).not.toHaveProperty('expectedVersion');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('DELETEs one set by id', () => {
    service.removeSet(1, 42).subscribe();

    const req = httpMock.expectOne(`${BASE}/api/venues/1/sets/42`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

/**
 * The per-row rename error mapper (#726). `ROW_NAME_TAKEN` is the one code the Row names panel
 * explains in its own words: it is the ordinary outcome of picking a name another row already has.
 */
describe('rowNameErrorOf (#726)', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  it('maps 401 to UNAUTHORIZED before reading the body', () => {
    expect(rowNameErrorOf(problem(401, 'ROW_NAME_TAKEN'))).toBe('UNAUTHORIZED');
  });

  it('passes through every code the Row names panel explains', () => {
    for (const code of [
      'ROW_NAME_TAKEN',
      'STALE_WRITE',
      'NO_SUCH_ROW',
      'NO_SUCH_VENUE',
      'NOT_VENUE_OWNER',
      'INVALID_REQUEST',
    ]) {
      expect(rowNameErrorOf(problem(409, code))).toBe(code);
    }
  });

  it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
    expect(rowNameErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
    expect(rowNameErrorOf(problem(500))).toBe('UNKNOWN');
    expect(rowNameErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });
});

/**
 * The per-set write error mapper (#600). `SET_IN_USE` is the #567/#599 claim guard — the one code
 * the panel explains in its own words, because it is the ordinary outcome on a live venue, not a fault.
 */
describe('setWriteErrorOf (#600)', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  it('maps 401 to UNAUTHORIZED before reading the body', () => {
    expect(setWriteErrorOf(problem(401, 'SET_IN_USE'))).toBe('UNAUTHORIZED');
  });

  it('passes through every code the panel explains', () => {
    for (const code of [
      'SET_IN_USE',
      'CELL_TAKEN',
      'DUPLICATE_POSITION',
      'NO_SUCH_SET',
      'NO_SUCH_VENUE',
      'NOT_VENUE_OWNER',
      'INVALID_REQUEST',
    ]) {
      expect(setWriteErrorOf(problem(409, code))).toBe(code);
    }
  });

  it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
    expect(setWriteErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
    expect(setWriteErrorOf(problem(500))).toBe('UNKNOWN');
    expect(setWriteErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });
});
