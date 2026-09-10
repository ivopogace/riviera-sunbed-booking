package ai.riviera.platform.booking.application.refund;

/**
 * What the Event Publication Registry still owes the listeners on the refund bulkhead, and the lever
 * to re-drive them — a driven port, implemented by {@code adapter/out} against the registry, the
 * {@code notification.application.MailOutbox} shape transplanted to the money path.
 *
 * <p><strong>Scoped by construction, to a named allowlist.</strong> Both methods speak only of
 * publications targeted at {@code BookingRefundListener} (the cancellation refund) and
 * {@code RemodelReleasePaymentListener} (the void of a remodel-released booking's uncollected
 * intent) — the two listeners that drain on the refund executor, so the two whose work that pool can
 * shed. The registry is shared infrastructure whose outstanding rows also carry the payment → confirm
 * spine ({@code PaymentEventListener}, invariant #8), {@code payout}'s accrual/reversal (invariant #9)
 * and {@code notification}'s mails — and unlike #405's module-prefix scope, a prefix cannot separate
 * this module's bulkhead listeners from its payment one, which is why the scope is an exact-id
 * allowlist.
 *
 * <p><strong>Re-driving is safe where re-deciding would not be.</strong> A re-driven publication
 * re-delivers the same {@code BookingCancelled} payload, so the listener re-issues the same gateway
 * call and a refund that already succeeded is returned, not repeated (invariants #8/#10) — because
 * the gateway checks what it holds before creating, which is what makes this lever safe to press
 * long after the {@code booking-<id>-refund} idempotency key has been pruned. Re-driving an
 * intent void is safe for the same reason from the other side: a voided intent answers
 * {@code NoCollection} and a collected one {@code NotCancellable}, and neither moves money
 * ({@code RESPONSIBILITIES.md} §{@code payment}). Nothing here is a delivery guarantee: a refund that
 * fails again simply stays outstanding, which is the registry's whole contract and why
 * {@code riviera.outbox.pending} and {@code riviera.refunds.failed} remain the signals to watch.
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
	 * Hands every outstanding publication of an allowed listener back to the registry for delivery,
	 * returning how many were handed over.
	 *
	 * <p>The count is what the scope matched — an upper bound on what was re-driven, because the v2
	 * registry's {@code markResubmitted} claim skips a publication whose previous resubmission is still
	 * in flight. The framework's resubmission entry point returns {@code void}, so the match count is
	 * the honest number available, and it is the one an admin acts on: how much is still owed.
	 */
	int resubmitOutstanding();
}
