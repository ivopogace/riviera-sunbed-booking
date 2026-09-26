package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for the owner's profile edit, a full replace of {@link VenueProfileCommand}'s fields
 * (an absent distance or location clears it); commission and payout currency are never part of it.
 * Module-internal (REST-only caller), so in {@code application}, not {@code api/} (invariant #11).
 * The implementation asserts ownership first ({@code NotVenueOwnerException} → 403, invariant #13),
 * then writes only if {@code expectedVersion} still matches: {@link ProfileUpdateOutcome}
 * {@code NO_SUCH_VENUE} → 404, {@code STALE_WRITE} → 409, so a stale tab never silently clobbers.
 */
public interface EditVenueProfile {

	/**
	 * Replace the venue's editable profile fields, conditional on {@code expectedVersion} (the token the
	 * tab loaded), after asserting {@code operator} owns the venue (invariant #13, asserted first).
	 */
	ProfileUpdateOutcome updateProfile(OperatorId operator, VenueId venueId, long expectedVersion,
			VenueProfileCommand command);
}
