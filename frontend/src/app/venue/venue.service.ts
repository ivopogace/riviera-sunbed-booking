import { HttpClient } from '@angular/common/http';
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

  getVenueMap(venueId: number): Observable<VenueMapView> {
    return this.http.get<VenueMapView>(`${environment.apiBaseUrl}/api/venues/${venueId}`);
  }
}
