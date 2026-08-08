package ai.riviera.platform.booking.application.refund;

/**
 * What the Event Publication Registry still owes the cancellation-refund listener, and the lever to
 * re-drive it — a driven port, implemented by {@code adapter/out} against the registry, the
 * {@code notification.application.MailOutbox} shape transplanted to the money path.
 *
 * <p><strong>Scoped by construction, to exactly one listener.</strong> Both methods speak only of
 * publications targeted at {@code BookingRefundListener}. The registry is shared infrastructure whose
 * outstanding rows also carry the payment → confirm spine ({@code PaymentEventListener}, invariant
 * #8), {@code payout}'s accrual/reversal (invariant #9) and {@code notification}'s mails — and unlike
 * #405's module-prefix scope, a prefix cannot separate this module's refund listener from its payment
 * one, which is why the scope is an exact-id allowlist of one (the issue's revised decision).
 *
 * <p><strong>Re-driving is safe where re-deciding would not be.</strong> A re-driven publication
 * re-delivers the same {@code BookingCancelled} payload, so the listener re-issues the same
 * idempotency-keyed gateway call ({@code booking-<id>-refund}) and a refund that already succeeded is
 * returned, not repeated (invariants #8/#10). Nothing here is a delivery guarantee: a refund that
 * fails again simply stays outstanding, which is the registry's whole contract and why
 * {@code riviera.outbox.pending} and {@code riviera.refunds.failed} remain the signals to watch.
 */
public interface RefundOutbox {

	/**
	 * How many refund publications are still outstanding.
	 *
	 * <p>Under {@code completion-mode=archive} a completed publication leaves the live table, so a
	 * refund that moved money can never be counted — or re-driven — here.
	 */
	int countOutstanding();

	/**
	 * Hands every outstanding refund publication back to the registry for delivery, returning how many
	 * were handed over.
	 *
	 * <p>The count is what the scope matched — an upper bound on what was re-driven, because the v2
	 * registry's {@code markResubmitted} claim skips a publication whose previous resubmission is still
	 * in flight. The framework's resubmission entry point returns {@code void}, so the match count is
	 * the honest number available, and it is the one an admin acts on: how much is still owed.
	 */
	int resubmitOutstanding();
}
