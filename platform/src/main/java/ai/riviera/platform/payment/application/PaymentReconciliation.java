package ai.riviera.platform.payment.application;

/**
 * The reconciliation of local payment state with the provider's (#102): detection and repair are separate acts, and
 * only {@link #repair} writes. The scheduler and the admin surface share this seam (RESPONSIBILITIES.md §payment).
 */
public interface PaymentReconciliation {

	/** Compare every recent open payment with the provider and report what differs; writes nothing. */
	ReconciliationReport report();

	/** Settle one payment from a fresh read of the provider (invariant #8); idempotent. */
	RepairOutcome repair(long paymentId);
}
