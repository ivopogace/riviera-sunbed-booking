package ai.riviera.platform.booking.application.request;

/**
 * The guest's own retraction of a pending booking request (issue #123) — the third and last way a
 * {@code PENDING_REQUEST} can end, beside the venue's {@code decline} and the sweep's {@code expire}
 * on {@link RespondToRequest} / {@code ExpireRequests}.
 *
 * <p>Unlike those two this is a <strong>guest</strong> command, so it is authorized by the booking
 * {@code code} alone — the bearer credential (invariant #7), the same key the code-gated view and
 * cancel use. There is no operator, no venue scope, and therefore no ownership check: the request
 * being withdrawn is by construction the one whose code the caller holds.
 *
 * <p>No money is involved. A pending request has no PaymentIntent (payment-request-on-accept), so
 * there is nothing to refund, nothing accrued to reverse, and no {@code BookingCancelled} to
 * publish. Internal to {@code booking} ({@code application}), not cross-module {@code api/}.
 */
public interface WithdrawRequest {

	/** Withdraw the pending request with {@code code}; returns the typed {@link WithdrawOutcome}. */
	WithdrawOutcome withdraw(String code);
}
