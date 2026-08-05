import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminOperatorsService } from './admin-operators.service';

describe('AdminOperatorsService', () => {
  const base = `${environment.apiBaseUrl}/api/admin/operators`;
  let service: AdminOperatorsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminOperatorsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs the pending registrations', async () => {
    const promise = service.pending();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 7, username: 'alice', contactEmail: 'a@v.example', registeredAt: '2026-07-18T00:00:00Z' },
    ]);

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('alice');
  });

  it('POSTs approve for an id', async () => {
    const promise = service.approve(7);
    const req = http.expectOne(`${base}/7/approve`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await promise;
  });

  it('POSTs reject for an id', async () => {
    const promise = service.reject(7);
    const req = http.expectOne(`${base}/7/reject`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await promise;
  });

  /** #519 (AC-1): typed grounds ride the suspension into the #507 admin audit trail. */
  it('sends typed grounds as the X-Audit-Reason header on suspend', async () => {
    const promise = service.suspend(7, '  reported by email  ');
    const req = http.expectOne(`${base}/7/suspend`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Audit-Reason')).toBe('reported by email');
    req.flush(null);
    await promise;
  });

  it('sends no header when the grounds are blank or absent (AC-2)', async () => {
    const withoutReason = service.suspend(7);
    http.expectOne(`${base}/7/suspend`).flush(null);
    await withoutReason;

    const blankReason = service.suspend(7, '   ');
    const req = http.expectOne(`${base}/7/suspend`);
    expect(req.request.headers.has('X-Audit-Reason')).toBe(false);
    req.flush(null);
    await blankReason;
  });

  it('replaces non-Latin-1 characters so the request cannot abort (AC-3)', async () => {
    // é is Latin-1 and survives; the em-dash (U+2014) is not and becomes a space.
    const promise = service.suspend(7, 'café — spam');
    const req = http.expectOne(`${base}/7/suspend`);
    expect(req.request.headers.get('X-Audit-Reason')).toBe('café   spam');
    req.flush(null);
    await promise;
  });
});
