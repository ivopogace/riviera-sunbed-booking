import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { VenueMapView } from './venue.model';

/**
 * Reads the public venue + beach-map catalogue (U1, `GET /api/venues/{id}`). Single
 * responsibility: typed access to the read API; no state of its own.
 */
@Service()
export class VenueService {
  private readonly http = inject(HttpClient);

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
