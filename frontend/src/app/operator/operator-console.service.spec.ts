import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  OperatorBeachMap,
  PayoutLedgerView,
  PendingRequestItem,
  RemodelCommitRequest,
  RemodelPreview,
  RequestDecision,
  SetBatchRequest,
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
  layoutBlockedSetsOf,
  layoutErrorOf,
  remodelPreviewOf,
  setBatchErrorOf,
  rowNameErrorOf,
  seasonClosureErrorOf,
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
 * The set batch apply client — one `PATCH` on the set collection carrying the swept ids and only
 * the touched fields, guarded by the same `setVersion` token as the bulk replace and the reprice.
 */
describe('OperatorConsoleService — the owner’s beach-map read', () => {
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

  it('GETs the map and its sparse locks from the owner-asserted beach-map resource', () => {
    let received: OperatorBeachMap | undefined;
    service.beachMap(1).subscribe((view) => (received = view));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/venues/1/beach-map`);
    expect(req.request.method).toBe('GET');
    req.flush({
      map: { id: 1, name: 'V', sets: [], setVersion: 4 },
      locks: [{ setId: 7, bookedOn: '2026-09-12', heldOn: null }],
    });

    expect(received?.map.setVersion).toBe(4);
    expect(received?.locks).toEqual([{ setId: 7, bookedOn: '2026-09-12', heldOn: null }]);
  });
});

describe('OperatorConsoleService — set batch apply', () => {
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

  it('PATCHes the set collection with the ids, the touched fields and the token, and returns the count', () => {
    const request: SetBatchRequest = {
      setIds: [10, 11],
      price: { minorUnits: 4000, currency: 'EUR' },
      expectedVersion: 5,
    };
    let actual: { updated: number } | undefined;
    service.applySetBatch(1, request).subscribe((result) => (actual = result));

    const req = httpMock.expectOne(`${BASE}/api/venues/1/sets`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(request);
    expect(req.request.body).not.toHaveProperty('tier');
    expect(req.request.body).not.toHaveProperty('pool');
    req.flush({ updated: 2 });
    expect(actual).toEqual({ updated: 2 });
  });
});

describe('setBatchErrorOf', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code === undefined ? {} : { code } });
  }

  it('maps 401 to UNAUTHORIZED before reading the body', () => {
    expect(setBatchErrorOf(problem(401, 'STALE_WRITE'))).toBe('UNAUTHORIZED');
  });

  it('passes through every code the batch panel explains', () => {
    for (const code of [
      'STALE_WRITE',
      'NO_SUCH_SET',
      'NO_SUCH_VENUE',
      'NOT_VENUE_OWNER',
      'INVALID_REQUEST',
    ] as const) {
      expect(setBatchErrorOf(problem(409, code))).toBe(code);
    }
  });

  it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
    expect(setBatchErrorOf(problem(409, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
    expect(setBatchErrorOf(problem(500))).toBe('UNKNOWN');
    expect(setBatchErrorOf(new Error('offline'))).toBe('UNKNOWN');
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

describe('OperatorConsoleService season closure (#1028)', () => {
  let service: OperatorConsoleService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperatorConsoleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('closes with PUT on the season-closure resource and answers the counts', () => {
    let result: unknown;
    service
      .closeForSeason(1, { reopenOn: '2027-05-15', advanceSales: true })
      .subscribe((r) => (result = r));
    const req = http.expectOne(`${BASE}/api/venues/1/season-closure`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ reopenOn: '2027-05-15', advanceSales: true });
    req.flush({
      closedForSeason: true,
      reopenOn: '2027-05-15',
      advanceSales: true,
      futureBookings: 3,
      pendingRequests: 1,
    });
    expect(result).toEqual({
      closedForSeason: true,
      reopenOn: '2027-05-15',
      advanceSales: true,
      futureBookings: 3,
      pendingRequests: 1,
    });
  });

  it('reopens with DELETE on the same resource', () => {
    let done = false;
    service.reopenForSeason(1).subscribe(() => (done = true));
    const req = http.expectOne(`${BASE}/api/venues/1/season-closure`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('maps the closure codes: the profile codes plus REOPEN_DATE_PASSED', () => {
    const fail = (status: number, code: string) =>
      new HttpErrorResponse({ status, error: { code } });
    expect(seasonClosureErrorOf(fail(422, 'REOPEN_DATE_PASSED'))).toBe('REOPEN_DATE_PASSED');
    expect(seasonClosureErrorOf(fail(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
    expect(seasonClosureErrorOf(fail(404, 'NO_SUCH_VENUE'))).toBe('NO_SUCH_VENUE');
    expect(seasonClosureErrorOf(fail(400, 'INVALID_REQUEST'))).toBe('INVALID_REQUEST');
    expect(seasonClosureErrorOf(fail(401, 'UNAUTHENTICATED'))).toBe('UNAUTHORIZED');
    expect(seasonClosureErrorOf(fail(500, 'BOOM'))).toBe('UNKNOWN');
    expect(seasonClosureErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });
});

describe('layout save error mapping (#1032)', () => {
  function problem(status: number, error: unknown): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  it('passes SETS_IN_USE through and reads the sets it names', () => {
    const refusal = problem(409, {
      code: 'SETS_IN_USE',
      sets: [
        { setId: 2, rowLabel: 'A', positionNo: 2, bookedOn: '2026-09-12', heldOn: null },
        { setId: 5, rowLabel: 'Front', positionNo: 1, bookedOn: null, heldOn: '2026-09-20' },
      ],
    });

    expect(layoutErrorOf(refusal)).toBe('SETS_IN_USE');
    expect(layoutBlockedSetsOf(refusal)).toEqual([
      { setId: 2, rowLabel: 'A', positionNo: 2, bookedOn: '2026-09-12', heldOn: null },
      { setId: 5, rowLabel: 'Front', positionNo: 1, bookedOn: null, heldOn: '2026-09-20' },
    ]);
  });

  it('drops an entry the server did not shape as a blocked set, and answers no sets for any other failure', () => {
    const malformed = problem(409, {
      code: 'SETS_IN_USE',
      sets: [
        { setId: '2', rowLabel: 'A', positionNo: 2, bookedOn: '2026-09-12', heldOn: null },
        { setId: 3, rowLabel: 'A', positionNo: 3, bookedOn: null, heldOn: null },
        { setId: 4, rowLabel: 'A', positionNo: 4, bookedOn: '2026-09-12', heldOn: null },
        null,
      ],
    });

    expect(layoutBlockedSetsOf(malformed)).toEqual([
      { setId: 4, rowLabel: 'A', positionNo: 4, bookedOn: '2026-09-12', heldOn: null },
    ]);
    expect(layoutBlockedSetsOf(problem(409, { code: 'SETS_IN_USE' }))).toEqual([]);
    expect(layoutBlockedSetsOf(problem(409, { code: 'STALE_WRITE' }))).toEqual([]);
    expect(layoutBlockedSetsOf(new Error('offline'))).toEqual([]);
    expect(layoutErrorOf(problem(409, { code: 'SOMETHING_ELSE' }))).toBe('UNKNOWN');
  });
});

describe('remodel commit error mapping (#1034)', () => {
  function problem(status: number, error: unknown): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  const FRESH: RemodelPreview = {
    moves: [],
    refunds: [],
    releases: [],
    staffHolds: [],
    blocks: [],
    keep: [],
    previewToken: 'v1.fresh',
  };

  it('passes STALE_PREVIEW and REMODEL_REFUSED through and reads the fresh picture they carry', () => {
    const stale = problem(409, { code: 'STALE_PREVIEW', preview: FRESH });
    const refused = problem(409, { code: 'REMODEL_REFUSED', preview: FRESH });

    expect(layoutErrorOf(stale)).toBe('STALE_PREVIEW');
    expect(layoutErrorOf(refused)).toBe('REMODEL_REFUSED');
    expect(remodelPreviewOf(stale)).toEqual(FRESH);
    expect(remodelPreviewOf(refused)).toEqual(FRESH);
    expect(layoutBlockedSetsOf(stale)).toEqual([]);
  });

  it('answers no picture for a body not shaped as a preview, a missing token, or any other failure', () => {
    expect(remodelPreviewOf(problem(409, { code: 'STALE_PREVIEW' }))).toBeNull();
    expect(remodelPreviewOf(problem(409, { code: 'STALE_PREVIEW', preview: null }))).toBeNull();
    expect(
      remodelPreviewOf(problem(409, { code: 'STALE_PREVIEW', preview: { ...FRESH, moves: 'x' } })),
    ).toBeNull();
    expect(
      remodelPreviewOf(
        problem(409, { code: 'STALE_PREVIEW', preview: { ...FRESH, previewToken: 7 } }),
      ),
    ).toBeNull();
    expect(remodelPreviewOf(problem(409, { code: 'SETS_IN_USE', sets: [] }))).toBeNull();
    expect(remodelPreviewOf(new Error('offline'))).toBeNull();
  });
});

describe('OperatorConsoleService — remodel commit + receipts (#1034)', () => {
  let service: OperatorConsoleService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperatorConsoleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs the commit with the layout body and the preview token, returning the receipt', () => {
    const request: RemodelCommitRequest = {
      sets: [
        {
          rowLabel: 'A',
          positionNo: 1,
          tier: 'PREMIUM',
          pool: 'ONLINE',
          gridX: 1,
          gridY: 1,
          price: { minorUnits: 2000, currency: 'EUR' },
        },
      ],
      expectedVersion: 3,
      previewToken: 'v1.moves',
    };
    let receiptId: number | undefined;
    service.commitLayout(1, request).subscribe((receipt) => (receiptId = receipt.receiptId));

    const req = http.expectOne(`${BASE}/api/venues/1/beach-map/commit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moves: [] });
    expect(receiptId).toBe(41);
  });

  it('GETs the venue’s receipts and one receipt by id', () => {
    let count: number | undefined;
    service.remodelReceipts(1).subscribe((list) => (count = list.length));
    const list = http.expectOne(`${BASE}/api/venues/1/remodels`);
    expect(list.request.method).toBe('GET');
    list.flush([{ receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moveCount: 2 }]);
    expect(count).toBe(1);

    let moves: number | undefined;
    service.remodelReceipt(1, 41).subscribe((receipt) => (moves = receipt.moves.length));
    const one = http.expectOne(`${BASE}/api/venues/1/remodels/41`);
    expect(one.request.method).toBe('GET');
    one.flush({ receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moves: [] });
    expect(moves).toBe(0);
  });
});
