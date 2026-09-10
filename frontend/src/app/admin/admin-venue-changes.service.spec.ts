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

  it('reads the fee in force', async () => {
    const promise = service.fee();
    const req = http.expectOne(`${base}/api/admin/venue-change-fee`);
    expect(req.request.method).toBe('GET');
    req.flush({ amountMinor: 500, currency: 'EUR' });

    expect(await promise).toEqual({ amountMinor: 500, currency: 'EUR' });
  });

  /** The amount goes out in minor units (invariant #5) and the response is what is now in force. */
  it('writes the fee in minor units and answers what is now stored', async () => {
    const promise = service.setFee(700);
    const req = http.expectOne(`${base}/api/admin/venue-change-fee`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ amountMinor: 700 });
    req.flush({ amountMinor: 700, currency: 'EUR' });

    expect(await promise).toEqual({ amountMinor: 700, currency: 'EUR' });
  });

  it('carries non-blank grounds into the audit trail, and sends no header without them', () => {
    void service.setFee(700, 'Board approved');
    const withReason = http.expectOne(`${base}/api/admin/venue-change-fee`);
    expect(withReason.request.headers.get('X-Audit-Reason')).toBe('Board approved');
    withReason.flush({ amountMinor: 700, currency: 'EUR' });

    void service.setFee(700, '   ');
    const blank = http.expectOne(`${base}/api/admin/venue-change-fee`);
    expect(blank.request.headers.has('X-Audit-Reason')).toBe(false);
    blank.flush({ amountMinor: 700, currency: 'EUR' });
  });

  /** Header values must be Latin-1; anything outside becomes a space rather than an aborted request. */
  it('flattens a reason the header encoding cannot carry', () => {
    void service.setFee(700, 'raised \u2014 season 2027 \u{1F600}');
    const req = http.expectOne(`${base}/api/admin/venue-change-fee`);
    expect(req.request.headers.get('X-Audit-Reason')).toBe('raised   season 2027');
    req.flush({ amountMinor: 700, currency: 'EUR' });
  });
});
