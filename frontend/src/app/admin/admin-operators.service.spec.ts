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
});
