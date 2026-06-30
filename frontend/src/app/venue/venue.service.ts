import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { VenueMapView, VenueSummary } from './venue.model';

/** Optional discovery filters; an omitted dimension is no constraint (mirrors the backend). */
export interface VenueListFilter {
  readonly beach?: string;
  readonly region?: string;
}

/**
 * Reads the public venue catalogue: the discovery list (`GET /api/venues`, U-discovery) and a
 * single venue + beach map (U1, `GET /api/venues/{id}`). Single responsibility: typed access to
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
    return this.http.get<VenueSummary[]>(`${environment.apiBaseUrl}/api/venues`, { params });
  }

  /**
   * The venue and its beach map for a given day. `date` is an ISO `YYYY-MM-DD` string; each set's
   * availability reflects the authoritative `set_availability` state for that date (issue #44).
   */
  getVenueMap(venueId: number, date: string): Observable<VenueMapView> {
    return this.http.get<VenueMapView>(`${environment.apiBaseUrl}/api/venues/${venueId}`, {
      params: new HttpParams().set('date', date),
    });
  }
}
