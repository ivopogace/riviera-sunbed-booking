import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminVenuePhotosService } from './admin-venue-photos.service';

describe('AdminVenuePhotosService', () => {
  const base = environment.apiBaseUrl;
  let service: AdminVenuePhotosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminVenuePhotosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads every slot of a venue, resolving previews against the API origin', async () => {
    const promise = service.slots(7);
    const req = http.expectOne(`${base}/api/admin/venues/7/photos`);
    expect(req.request.method).toBe('GET');
    req.flush({
      venueId: 7,
      photos: {
        cover: { previewUrl: '/api/venues/7/photos/beef01' },
        sunbeds: { previewUrl: null },
        bar: { previewUrl: null },
      },
    });

    const view = await promise;
    expect(view.venueId).toBe(7);
    expect(view.slots.map((slot) => slot.slot)).toEqual(['cover', 'sunbeds', 'bar']);
    expect(view.slots[0].previewUrl).toContain('/api/venues/7/photos/beef01');
    expect(view.slots[1].previewUrl).toBeNull();
  });

  it('takes a slot down with the typed grounds riding the audit header', async () => {
    const promise = service.takedown(7, 'cover', 'reported\r\nby email');
    const req = http.expectOne(`${base}/api/admin/venues/7/photos/cover`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('X-Audit-Reason')).toBe('reported  by email');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });
});
