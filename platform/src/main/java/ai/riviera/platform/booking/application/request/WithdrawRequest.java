package ai.riviera.platform.booking.application.request;

/**
 * The guest's own retraction of a pending booking request: the third way a {@code PENDING_REQUEST}
 * ends, beside the venue's decline ({@link RespondToRequest}) and the {@code ExpireRequests} sweep.
 * Authorized by the booking {@code code} alone (bearer credential, invariant #7); no ownership
 * check. No money: a pending request has no PaymentIntent <em>on record</em>, so no refund and no
 * {@code BookingCancelled} — but a failed accept ({@code revertAcceptToPending}) may leave an
 * unregistered Stripe intent no webhook can correlate. Rationale: RESPONSIBILITIES.md §booking.
 */
public interface WithdrawRequest {

	/** Withdraw the pending request with {@code code}; returns the typed {@link WithdrawOutcome}. */
	WithdrawOutcome withdraw(String code);
}
