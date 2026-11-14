import { signal } from '@angular/core';

import { VenuePin } from '../app/booking/venue-pin';
import { VenueLocation } from '../app/shared/venue-views';

/** A {@link VenuePin} answering `at` for any venue, so a page spec makes no venue read. */
export function venuePinStub(at: VenueLocation | null = null): Pick<VenuePin, 'locationOf'> {
  return { locationOf: () => signal(at).asReadonly() };
}
