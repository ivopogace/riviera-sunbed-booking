package ai.riviera.platform.booking.application.request;

/**
 * The closed set of outcomes of {@link RespondToRequest#decline}. Declining is deliberately
 * more lenient than accepting: a pending request past its deadline may still be declined (the
 * decline just beats the expiry sweep to the same release), but a request that already left
 * {@code PENDING_REQUEST} cannot be. Ownership mismatch throws (invariant #13), as on accept.
 */
public sealed interface DeclineOutcome {

	/** The request is terminally {@code DECLINED} and the {@code (set, date)} hold released. */
	record Declined() implements DeclineOutcome {
	}

	enum Rejected implements DeclineOutcome {
		/** No pending request with this id at this venue (unknown id or foreign venue's booking). */
		NO_SUCH_REQUEST,
		/** The booking exists but is not {@code PENDING_REQUEST} (already decided/paid/cancelled). */
		NOT_PENDING
	}
}
