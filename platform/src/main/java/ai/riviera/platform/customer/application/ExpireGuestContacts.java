package ai.riviera.platform.customer.application;

/**
 * Driving port for the automated retention sweep — scrub guest contacts whose statutory retention basis
 * has expired, reusing the right-to-erasure tombstone (ADR-0010: pseudonymize in place, never delete) and,
 * like it, tombstoning the scrubbed contacts' reviews in the same transaction.
 *
 * <p><strong>Internal, not a published named interface</strong> (#11): the only caller is the
 * module's own scheduler in {@code adapter/in}; an interface so it depends on the use case and
 * the service stays package-private.
 */
public interface ExpireGuestContacts {

	/**
	 * Scrub up to one batch of expired guest contacts; idempotent, as every scrub is guarded on
	 * {@code erased_at IS NULL}. Booking / payment / payout records are never touched (#9, ADR-0010).
	 * @return contacts tombstoned this run (0 if none); scrubbed reviews are logged, not counted
	 */
	int sweep();
}
