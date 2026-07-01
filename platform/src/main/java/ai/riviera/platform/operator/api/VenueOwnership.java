package ai.riviera.platform.operator.api;

import java.util.Set;

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
	 * The venues explicitly mapped to {@code operator}. (An owns-all operator is not enumerable
	 * here — it holds no explicit mapping rows — so this returns its explicit set, empty for the
	 * interim bootstrap operator.)
	 */
	Set<VenueRef> ownedVenues(OperatorId operator);
}
