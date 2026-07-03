package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for editing a venue's profile fields (T7, issue #140) — currently the
 * amenity set + distance-to-water. Internal to the {@code venue} module (REST-only caller), so it
 * lives in {@code application}, not {@code api/} (invariant #11), exactly like {@link EditBeachMap}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before any
 * write (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. The
 * edit REPLACES the whole profile (the editor re-sends every selected amenity, and clears the
 * distance when absent); a {@link ChangeOutcome} of {@code Rejected(NO_SUCH_VENUE)} maps to 404
 * when the venue does not exist.
 */
public interface EditVenueProfile {

	/** Replace the venue's amenities + distance-to-water (after asserting {@code operator} owns it). */
	ChangeOutcome updateProfile(OperatorId operator, VenueId venueId, VenueProfileCommand command);
}
