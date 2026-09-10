import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AdminVenueChangesService } from './admin-venue-changes.service';

describe('AdminVenueChangesService', () => {
  const base = environment.apiBaseUrl;
  let service: AdminVenueChangesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminVenueChangesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * The report reaches the client as it comes off the ledger: venue ids, counts and two amounts kept
   * apart by what they mean. Nothing is re-summed here — a fee is not part of what a guest got back.
   */
  it('reads the venue-caused refunds report as the ledger answers it', async () => {
    const promise = service.report();
    const req = http.expectOne(`${base}/api/admin/venue-change-refunds`);
    expect(req.request.method).toBe('GET');
    req.flush({
      venues: [
        { venueId: 3, refundCount: 2, refundedMinor: 14000, feeMinor: 1000, currency: 'EUR' },
      ],
    });

    expect(await promise).toEqual({
      venues: [
        { venueId: 3, refundCount: 2, refundedMinor: 14000, feeMinor: 1000, currency: 'EUR' },
      ],
    });
  });
});
