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

  /**
   * #693 AC-7: the picker reads the ADMIN venue list, not the public catalogue — the catalogue
   * hides venues whose owner is not ACTIVE, which are exactly the venues a moderator must reach.
   */
  it('lists venues from the admin venue read, hidden venues included', async () => {
    const promise = service.venues();
    const req = http.expectOne(`${base}/api/admin/venues`);
    expect(req.request.method).toBe('GET');
    req.flush({
      venues: [
        { venueId: 1, name: 'Miramar Beach Club', beach: 'Ksamil', commissionBps: 500 },
        { venueId: 9, name: 'Hidden Cove', beach: 'Dhërmi', commissionBps: 500 },
      ],
    });

    const venues = await promise;
    expect(venues).toEqual([
      { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
      { id: 9, name: 'Hidden Cove', beach: 'Dhërmi' },
    ]);
  });
});
