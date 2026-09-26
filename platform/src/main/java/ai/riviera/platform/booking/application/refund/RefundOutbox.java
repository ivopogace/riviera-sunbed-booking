package ai.riviera.platform.booking.application.refund;

/**
 * What the Event Publication Registry still owes the refund-bulkhead listeners, and the lever to
 * re-drive them. Scoped to an exact-id allowlist ({@code BookingRefundListener} and
 * {@code RemodelReleasePaymentListener}), never a package prefix, which would also sweep
 * {@code PaymentEventListener}'s payment → confirm spine (invariant #8). Re-driving is safe: the
 * gateway adopts a refund it already holds, and a void moves no money. Not a delivery guarantee:
 * watch {@code riviera.refunds.failed}. Rationale: {@code RESPONSIBILITIES.md} §booking, §payment.
 */
public interface RefundOutbox {

	/**
	 * How many publications of the allowed listeners are still outstanding.
	 *
	 * <p>Under {@code completion-mode=archive} a completed publication leaves the live table, so a
	 * refund that moved money can never be counted — or re-driven — here.
	 */
	int countOutstanding();

	/**
	 * Hands every outstanding allowed publication back to the registry; returns how many the scope
	 * matched, an upper bound, since the registry skips one whose previous resubmission is still in
	 * flight (the framework's entry point reports nothing more precise).
	 */
	int resubmitOutstanding();
}
