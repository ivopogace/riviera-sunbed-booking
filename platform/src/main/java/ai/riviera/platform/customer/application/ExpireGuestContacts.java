package ai.riviera.platform.customer.application;

/**
 * Driving port for the automated retention sweep — scrub guest contacts whose statutory retention basis
 * has expired, reusing the right-to-erasure tombstone (ADR-0010: pseudonymize in place, never delete) and,
 * like it, tombstoning the scrubbed contacts' reviews in the same transaction.
 *
 * <p><strong>Internal, not a published named interface</strong> (invariant #11): the only caller is the
 * {@code customer} module's own scheduler in {@code adapter/in}. It is an interface rather than a bare
 * {@code @Service} so the driving adapter depends on the use case, not the implementation — and so the
 * service stays package-private.
 */
public interface ExpireGuestContacts {

	/**
	 * Scrub up to one batch of guest contacts whose retention basis has expired.
	 *
	 * <p>Idempotent and safely re-runnable: already-tombstoned rows are not candidates, and every scrub is
	 * guarded on {@code erased_at IS NULL}, so a concurrent or repeated run is a no-op rather than a
	 * double-erasure. Financial records (booking / payment / payout) are never touched — invariant #9.
	 *
	 * @return how many guest contacts this run tombstoned (0 when nothing has expired); the reviews scrubbed
	 *         alongside them are logged, not counted here
	 */
	int sweep();
}
