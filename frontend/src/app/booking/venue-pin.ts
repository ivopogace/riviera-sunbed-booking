import { httpResource } from '@angular/common/http';
import { Service, Signal, computed } from '@angular/core';

import { environment } from '../../environments/environment';
import { VenueLocation, VenueMapView } from '../shared/venue-views';

/**
 * A booked venue's map pin, read from the public venue read (`GET /api/venues/{id}`) rather than
 * carried on the booking read. `null` while loading, for an unpinned venue, and when the read fails
 * (a venue hidden from tourists answers `404`): every case renders no Directions row.
 */
@Service()
export class VenuePin {
  /** The pin of the venue `venueId` names, re-read when it changes; run in an injection context. */
  locationOf(venueId: () => number | undefined): Signal<VenueLocation | null> {
    const venue = httpResource<VenueMapView>(() => {
      const id = venueId();
      return id === undefined ? undefined : `${environment.apiBaseUrl}/api/venues/${id}`;
    });
    return computed(() => (venue.hasValue() ? (venue.value().location ?? null) : null));
  }
}
