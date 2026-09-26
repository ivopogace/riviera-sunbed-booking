import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiPhotoView, resolveCoverPhoto } from '../shared/photo-url';
import {
  DailyAvailability,
  VenueMapView,
  VenueReviewsPage,
  VenueSummary,
} from '../shared/venue-views';

/** Optional discovery filters; an omitted dimension is no constraint (mirrors the backend). */
export interface VenueListFilter {
  readonly beach?: string;
  readonly region?: string;
}

/**
 * Reads the public venue catalogue: the discovery list (`GET /api/venues`), a
 * single venue + beach map (`GET /api/venues/{id}`), that venue's per-day availability over a
 * window (`GET /api/venues/{id}/availability-calendar`), and its listed reviews a page at a time
 * (`GET /api/venues/{id}/reviews`). Single responsibility: typed access to the read API; no state
 * of its own.
 */
@Service()
export class VenueService {
  private readonly http = inject(HttpClient);

  /**
   * The venues matching `filter` for the ISO `YYYY-MM-DD` day `date`, or for the stay `date` to
   * `lastDate` (a one-day read sends no last day and gets no verdict); each `availability` count is
   * the authoritative `set_availability` state for the first day (invariant #2). Empty/omitted
   * filter dimensions are not sent, so the server lists all venues.
   */
  listVenues(
    filter: VenueListFilter,
    date: string,
    lastDate: string = date,
  ): Observable<VenueSummary[]> {
    let params = new HttpParams().set('date', date);
    if (lastDate !== date) {
      params = params.set('lastDate', lastDate);
    }
    if (filter.beach) {
      params = params.set('beach', filter.beach);
    }
    if (filter.region) {
      params = params.set('region', filter.region);
    }
    return this.http.get<VenueSummary[]>(`${environment.apiBaseUrl}/api/venues`, { params }).pipe(
      // Photo paths resolve against the API origin (no-op in same-origin prod).
      map((venues) =>
        venues.map((venue) => ({
          ...venue,
          coverPhoto: resolveCoverPhoto(venue.coverPhoto),
          photos: (venue.photos ?? []).map(apiPhotoView),
        })),
      ),
    );
  }

  /**
   * The venue and its beach map for the ISO day `date`, or for the stay `date` to `lastDate` (a
   * one-day read sends no last day); each set's availability reflects the authoritative
   * `set_availability` state for those days.
   */
  getVenueMap(venueId: number, date: string, lastDate: string = date): Observable<VenueMapView> {
    const params = new HttpParams().set('date', date);
    return this.http
      .get<VenueMapView>(`${environment.apiBaseUrl}/api/venues/${venueId}`, {
        params: lastDate === date ? params : params.set('lastDate', lastDate),
      })
      .pipe(
        map((venue) => ({
          ...venue,
          coverPhoto: resolveCoverPhoto(venue.coverPhoto),
          photos: (venue.photos ?? []).map(apiPhotoView),
          lightboxPhotos: (venue.lightboxPhotos ?? []).map(apiPhotoView),
        })),
      );
  }

  /**
   * Per-day free/total set counts over the inclusive ISO window `[from, to]` (`Europe/Tirane`
   * days, #6): one ascending entry per day, untouched days at `free === total`. Pass a bounded
   * range: the server `400`s an inverted window or one over 62 days; errors are the caller's.
   */
  availabilityCalendar(venueId: number, from: string, to: string): Observable<DailyAvailability[]> {
    return this.http.get<DailyAvailability[]>(
      `${environment.apiBaseUrl}/api/venues/${venueId}/availability-calendar`,
      { params: new HttpParams().set('from', from).set('to', to) },
    );
  }

  /**
   * One page of the venue's listed reviews, newest first: the first page when `cursor` is omitted,
   * else the page after the `nextCursor` a previous page answered. The page size is the server's.
   * A venue tourists cannot see answers `404`, like the map read; errors are left for the caller.
   */
  reviews(venueId: number, cursor?: number): Observable<VenueReviewsPage> {
    const params = cursor === undefined ? new HttpParams() : new HttpParams().set('cursor', cursor);
    return this.http.get<VenueReviewsPage>(
      `${environment.apiBaseUrl}/api/venues/${venueId}/reviews`,
      {
        params,
      },
    );
  }
}
