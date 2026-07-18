package ai.riviera.platform.operator.api;

import java.util.Set;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

/**
 * The {@code operator} module's published authorization port (invariant #13) — a synchronous
 * <em>inbound</em> ("call-me") query, so it lives in {@code api}, not {@code spi}. Every
 * venue-scoped application service calls {@link #assertOwns} as its first act to enforce that the
 * authenticated operator owns the venue it is acting on; a mismatch is a broken-object-level-
 * authorization attempt (OWASP API #1) and must be rejected with {@code 403}.
 *
 * <p>The check lives in the application service (not the controller alone) so no driving adapter
 * can bypass it. {@code operator} owns the mapping and answers the question; it does not sit in
 * the request path performing the enforcement (RESPONSIBILITIES.md).
 */
public interface VenueOwnership {

	/**
	 * Verify that {@code operator} owns {@code venue}; return normally if so, otherwise throw
	 * {@link NotVenueOwnerException}. An operator flagged as owning all venues (the interim
	 * bootstrap operator, retired by #74) passes for any venue.
	 */
	void assertOwns(OperatorId operator, VenueRef venue);

	/**
	 * The venues explicitly mapped to {@code operator}. With the owns-all bootstrap retired (#115),
	 * ownership is strictly this explicit mapping.
	 */
	Set<VenueRef> ownedVenues(OperatorId operator);

	/**
	 * Record that {@code operator} owns {@code venue} — the write side of the ownership mapping,
	 * used by <strong>creator-owns-on-create</strong> (#115): the {@code venue} application service
	 * calls this in the same transaction as the venue insert so a newly-created venue is owned by its
	 * creator atomically (never a window where the creator is {@code 403}'d on its own venue). A
	 * venue is owned by at most one operator ({@code operator_venue.venue_id} is the PK), so calling
	 * this for an already-owned venue is a constraint violation — expected only for a freshly-created
	 * venue with no prior owner.
	 */
	void assignOwner(OperatorId operator, VenueRef venue);
}
