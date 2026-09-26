package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving port for the closed-for-season transition: close (optional reopen day, advance-sales
 * opt-in) or reopen by hand. Module-internal, so in {@code application}, not {@code api/} (#11).
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before either
 * write (invariant #13, {@code NotVenueOwnerException} → 403). Closing touches no booking, hold
 * or request; a closed venue stays visible and unsellable. Why its own port, not a profile field:
 * RESPONSIBILITIES.md §venue.
 */
public interface CloseForSeason {

	/**
	 * Close the venue: replace its closure with {@code closure} (which must be a closed value) and
	 * answer the counts of what is still owed from today in {@code Europe/Tirane}. A reopen day that
	 * is not after today is refused.
	 */
	CloseOutcome close(OperatorId operator, VenueId venueId, SeasonClosure closure);

	/** Clear the venue's closure. Idempotent: an open venue reopens to open. */
	ReopenOutcome reopen(OperatorId operator, VenueId venueId);
}
