package ai.riviera.platform.operator.api;

import java.util.Set;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * The {@code operator} module's published authorization port (invariant #13), a synchronous
 * <em>inbound</em> ("call-me") query, so it lives in {@code api}, not {@code spi}. Every
 * venue-scoped application service calls {@link #assertOwns} as its first act; a mismatch is a
 * broken-object-level-authorization attempt (OWASP API #1), rejected with {@code 403}. Checked in
 * the application service, not the controller alone, so no driving adapter can bypass it;
 * {@code operator} answers, it does not enforce. Rationale: RESPONSIBILITIES.md §operator.
 */
public interface VenueOwnership {

	/**
	 * Verify that {@code operator} owns {@code venue}; return normally if so, otherwise throw
	 * {@link NotVenueOwnerException}.
	 */
	void assertOwns(OperatorId operator, VenueRef venue);

	/**
	 * The venues explicitly mapped to {@code operator}. With the owns-all bootstrap retired,
	 * ownership is strictly this explicit mapping.
	 */
	Set<VenueRef> ownedVenues(OperatorId operator);

	/**
	 * Record that {@code operator} owns {@code venue} (creator-owns-on-create), called in the venue
	 * insert's transaction so the creator is never {@code 403}'d on it. One owner per venue (PK
	 * {@code operator_venue.venue_id}): assigning an already-owned venue is a constraint violation.
	 */
	void assignOwner(OperatorId operator, VenueRef venue);
}
