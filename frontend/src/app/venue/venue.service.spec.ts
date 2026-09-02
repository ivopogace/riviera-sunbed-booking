import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { DailyAvailability, VenueReviewsPage } from '../shared/venue-views';
import { VenueService } from './venue.service';

/**
 * Pins the tourist read client against the shipped contracts. The calendar read is the one this
 * suite exists for: its window is caller-chosen and server-capped, so the params it sends are part
 * of the contract rather than an implementation detail.
 */
describe('VenueService', () => {
  let service: VenueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VenueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('reviews', () => {
    it('asks the reviews path with no cursor for the first page', () => {
      service.reviews(7).subscribe();

      const request = httpMock.expectOne(
        (req) => req.url === `${environment.apiBaseUrl}/api/venues/7/reviews`,
      );

      expect(request.request.method).toBe('GET');
      expect(request.request.params.has('cursor')).toBe(false);
      request.flush({ reviews: [], nextCursor: null });
    });

    it('passes the cursor back as the cursor param for a later page', () => {
      service.reviews(7, 41).subscribe();

      const request = httpMock.expectOne((req) => req.url.endsWith('/api/venues/7/reviews'));

      expect(request.request.params.get('cursor')).toBe('41');
      request.flush({ reviews: [], nextCursor: null });
    });

    it('passes the page through untouched', () => {
      const body: VenueReviewsPage = {
        reviews: [{ id: 41, stars: 4, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great' }],
        nextCursor: 41,
      };
      let received: VenueReviewsPage | undefined;

      service.reviews(7).subscribe((page) => {
        received = page;
      });
      httpMock.expectOne((req) => req.url.endsWith('/api/venues/7/reviews')).flush(body);

      expect(received).toEqual(body);
    });
  });

  describe('availabilityCalendar', () => {
    it('asks the calendar path for the caller-chosen inclusive window', () => {
      service.availabilityCalendar(7, '2026-08-01', '2026-08-31').subscribe();

      const request = httpMock.expectOne(
        (req) => req.url === `${environment.apiBaseUrl}/api/venues/7/availability-calendar`,
      );

      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('from')).toBe('2026-08-01');
      expect(request.request.params.get('to')).toBe('2026-08-31');
      request.flush([]);
    });

    it('passes the days through untouched, in the order the server sent them', () => {
      const body: DailyAvailability[] = [
        { date: '2026-08-01', free: 21, total: 24 },
        { date: '2026-08-02', free: 0, total: 24 },
      ];
      let received: DailyAvailability[] | undefined;

      service.availabilityCalendar(7, '2026-08-01', '2026-08-02').subscribe((days) => {
        received = days;
      });
      httpMock
        .expectOne((req) => req.url.endsWith('/api/venues/7/availability-calendar'))
        .flush(body);

      expect(received).toEqual(body);
    });

    it('leaves an error for the caller to branch on, as the other reads do', () => {
      let status: number | undefined;

      service.availabilityCalendar(9, '2026-08-01', '2026-08-02').subscribe({
        error: (error: { status: number }) => {
          status = error.status;
        },
      });
      httpMock
        .expectOne((req) => req.url.endsWith('/api/venues/9/availability-calendar'))
        .flush('gone', { status: 404, statusText: 'Not Found' });

      expect(status).toBe(404);
    });
  });
});
