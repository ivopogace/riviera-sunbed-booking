package ai.riviera.platform.customer.vocabulary;

/**
 * Result of a right-to-erasure request, a value, not an exception ("nothing to erase" is normal
 * flow). {@link #ERASED}: at least one live row (account, guest contact, and/or a review of the
 * subject's bookings) was tombstoned. {@link #ALREADY_ERASED}: the subject exists, was already
 * tombstoned, and no review of theirs was left to scrub (self-service re-request).
 * {@link #NOT_FOUND}: no live subject; the edge maps it to a no-op 204, so an erasure request never
 * reveals whether an email exists.
 */
public enum EraseOutcome {
	ERASED,
	ALREADY_ERASED,
	NOT_FOUND
}
