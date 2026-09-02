import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminReviewsService } from './admin-reviews.service';

describe('AdminReviewsService', () => {
  const base = environment.apiBaseUrl;
  let service: AdminReviewsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminReviewsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the first page without a cursor and later pages with one', async () => {
    const first = service.reviews(7);
    const firstReq = http.expectOne(`${base}/api/admin/venues/7/reviews`);
    expect(firstReq.request.method).toBe('GET');
    firstReq.flush({ reviews: [], nextCursor: 21 });
    expect(await first).toEqual({ reviews: [], nextCursor: 21 });

    const next = service.reviews(7, 21);
    http.expectOne(`${base}/api/admin/venues/7/reviews?cursor=21`).flush({
      reviews: [],
      nextCursor: null,
    });
    expect(await next).toEqual({ reviews: [], nextCursor: null });
  });

  it('hides with the typed grounds riding the audit header, and without one when none were given', async () => {
    const withReason = service.hide(30, 'reported by\r\nthe venue');
    const req = http.expectOne(`${base}/api/admin/reviews/30/hide`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Audit-Reason')).toBe('reported by  the venue');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await withReason;

    const bare = service.hide(31);
    const bareReq = http.expectOne(`${base}/api/admin/reviews/31/hide`);
    expect(bareReq.request.headers.has('X-Audit-Reason')).toBe(false);
    bareReq.flush(null, { status: 204, statusText: 'No Content' });
    await bare;
  });

  it('un-hides by review id', async () => {
    const promise = service.unhide(30);
    const req = http.expectOne(`${base}/api/admin/reviews/30/unhide`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });
});
