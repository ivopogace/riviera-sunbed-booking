import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminPayoutsService, payoutMarkErrorOf } from './admin-payouts.service';
import { PayoutBatchView } from './admin.model';

const BATCH: PayoutBatchView = {
  id: 11,
  venueId: 3,
  periodKey: '2026-W25',
  totalNetMinor: 9350,
  currency: 'EUR',
  status: 'DRAFT',
};

describe('AdminPayoutsService', () => {
  const api = `${environment.apiBaseUrl}/api/admin/payout-batches`;
  let service: AdminPayoutsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminPayoutsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads a period by its ISO-week key', async () => {
    const promise = service.forPeriod('2026-W25');
    const req = http.expectOne(`${api}?period=2026-W25`);
    expect(req.request.method).toBe('GET');
    req.flush([BATCH]);

    expect(await promise).toEqual([BATCH]);
  });

  it('generates a period with a POST that carries only the period', async () => {
    const promise = service.generate('2026-W25');
    const req = http.expectOne(`${api}?period=2026-W25`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush([BATCH]);

    expect(await promise).toEqual([BATCH]);
  });

  /** The server freezes the batch only at this total: it is what the admin saw, not what the row holds. */
  it('reports a batch with the total the admin reviewed', async () => {
    const promise = service.markReported(11, -1250);
    const req = http.expectOne(`${api}/11`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'REPORTED', expectedTotalNetMinor: -1250 });
    req.flush({ ...BATCH, status: 'REPORTED' });

    expect((await promise).status).toBe('REPORTED');
  });

  it('settles a batch with the status alone', async () => {
    const promise = service.markSettled(11);
    const req = http.expectOne(`${api}/11`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'SETTLED' });
    req.flush({ ...BATCH, status: 'SETTLED' });

    expect((await promise).status).toBe('SETTLED');
  });
});

describe('payoutMarkErrorOf', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  it('keeps the three refusals the tab answers differently', () => {
    expect(payoutMarkErrorOf(problem(409, 'TOTAL_CHANGED'))).toBe('TOTAL_CHANGED');
    expect(payoutMarkErrorOf(problem(409, 'ILLEGAL_TRANSITION'))).toBe('ILLEGAL_TRANSITION');
    expect(payoutMarkErrorOf(problem(404, 'NO_SUCH_BATCH'))).toBe('NO_SUCH_BATCH');
  });

  it('reads anything else as unknown', () => {
    expect(payoutMarkErrorOf(problem(400, 'INVALID_REQUEST'))).toBe('UNKNOWN');
    expect(payoutMarkErrorOf(problem(502))).toBe('UNKNOWN');
    expect(payoutMarkErrorOf(new Error('offline'))).toBe('UNKNOWN');
  });
});
