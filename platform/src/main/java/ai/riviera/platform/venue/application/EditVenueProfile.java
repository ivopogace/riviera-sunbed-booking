package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for editing a venue's profile fields —
 * name/beach/region/description, booking mode, booking cutoff, the amenity set, and
 * distance-to-water. Commission and payout currency are read-only for operators and are never part
 * of this write. Internal to the {@code venue} module (REST-only caller), so it lives in
 * {@code application}, not {@code api/} (invariant #11), exactly like {@link EditBeachMap}.
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before any
 * write (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. The
 * edit REPLACES the whole profile (the form re-sends every field, and clears the distance when
 * absent).
 *
 * <p>Optimistic concurrency: the caller passes the {@code expectedVersion} it loaded with the
 * profile; the write is conditional on it. A {@link ProfileUpdateOutcome} of {@code NO_SUCH_VENUE}
 * maps to 404 when the venue does not exist, and {@code STALE_WRITE} to 409 when another writer has
 * bumped the version since the load — so a stale tab cannot silently clobber
 * {@code booking_mode}/{@code booking_cutoff}.
 */
public interface EditVenueProfile {

	/**
	 * Replace the venue's editable profile fields, conditional on {@code expectedVersion} (the token the
	 * tab loaded), after asserting {@code operator} owns the venue (invariant #13, asserted first).
	 */
	ProfileUpdateOutcome updateProfile(OperatorId operator, VenueId venueId, long expectedVersion,
			VenueProfileCommand command);
}
