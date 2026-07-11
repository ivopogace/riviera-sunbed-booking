package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for editing a venue's profile fields (T7 #140, widened by O8 #177) —
 * name/beach/region/description, booking mode, booking cutoff, the amenity set, and
 * distance-to-water. Commission and payout currency are read-only for operators and are never part
 * of this write. Internal to the {@code venue} module (REST-only caller), so it lives in
 * {@code application}, not {@code api/} (invariant #11), exactly like {@link EditBeachMap}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before any
 * write (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. The
 * edit REPLACES the whole profile (the form re-sends every field, and clears the distance when
 * absent); a {@link ChangeOutcome} of {@code Rejected(NO_SUCH_VENUE)} maps to 404 when the venue
 * does not exist.
 */
public interface EditVenueProfile {

	/** Replace the venue's editable profile fields (after asserting {@code operator} owns it). */
	ChangeOutcome updateProfile(OperatorId operator, VenueId venueId, VenueProfileCommand command);
}
