package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Driving (inbound) port for the venue's closed-for-season state transition — close with an
 * optional reopen day and the advance-sales opt-in, or reopen by hand. Its own port rather than a
 * field of the profile full-replace: a state change rides no version token, and the close answers
 * what guests are still owed. Internal to the {@code venue} module (REST-only caller), so it lives
 * in {@code application}, not {@code api/} (invariant #11).
 *
 * <p>Venue-scoped: the implementation verifies {@code operator} owns {@code venueId} before either
 * write (invariant #13), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. Closing
 * touches no booking, hold or request; a closed venue stays visible and unsellable (glossary:
 * <em>Closed for season</em>). Rationale: RESPONSIBILITIES.md §venue.
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
