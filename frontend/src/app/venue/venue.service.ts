import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { apiPhotoUrl, resolveCoverPhoto } from '../shared/photo-url';
import { DailyAvailability, VenueMapView, VenueSummary } from '../shared/venue-views';

/** Optional discovery filters; an omitted dimension is no constraint (mirrors the backend). */
export interface VenueListFilter {
  readonly beach?: string;
  readonly region?: string;
}

/**
 * Reads the public venue catalogue: the discovery list (`GET /api/venues`), a
 * single venue + beach map (`GET /api/venues/{id}`), and that venue's per-day availability over a
 * window (`GET /api/venues/{id}/availability-calendar`). Single responsibility: typed access to
 * the read API; no state of its own.
 */
@Service()
export class VenueService {
  private readonly http = inject(HttpClient);

  /**
   * The venues matching `filter` for a given day, as discovery summaries. `date` is an ISO
   * `YYYY-MM-DD` string; each venue's `availability` count reflects the authoritative
   * `set_availability` state for that date (invariant #2). Empty/omitted filter dimensions are
   * not sent, so the server lists all venues.
   */
  listVenues(filter: VenueListFilter, date: string): Observable<VenueSummary[]> {
    let params = new HttpParams().set('date', date);
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
          photos: (venue.photos ?? []).map(apiPhotoUrl),
        })),
      ),
    );
  }

  /**
   * The venue and its beach map for a given day. `date` is an ISO `YYYY-MM-DD` string; each set's
   * availability reflects the authoritative `set_availability` state for that date.
   */
  getVenueMap(venueId: number, date: string): Observable<VenueMapView> {
    return this.http
      .get<VenueMapView>(`${environment.apiBaseUrl}/api/venues/${venueId}`, {
        params: new HttpParams().set('date', date),
      })
      .pipe(
        map((venue) => ({
          ...venue,
          coverPhoto: resolveCoverPhoto(venue.coverPhoto),
          photos: (venue.photos ?? []).map(apiPhotoUrl),
        })),
      );
  }

  /**
   * Per-day free/total set counts for one venue across the inclusive window `[from, to]`, as the
   * date picker's availability signal. Both bounds are ISO `YYYY-MM-DD` civil days in
   * `Europe/Tirane` (invariant #6); the server answers one ascending entry per day, days nobody has
   * touched included at `free === total`.
   *
   * <p>The server rejects an inverted window, and one wider than 62 days, with `400` — so a caller
   * asks for a bounded range it chose, never an open one. Errors are left for the caller to branch
   * on, like the reads above.
   */
  availabilityCalendar(venueId: number, from: string, to: string): Observable<DailyAvailability[]> {
    return this.http.get<DailyAvailability[]>(
      `${environment.apiBaseUrl}/api/venues/${venueId}/availability-calendar`,
      { params: new HttpParams().set('from', from).set('to', to) },
    );
  }
}
