package ai.riviera.platform.booking.application.refund;

import ai.riviera.platform.shared.ResubmissionOutcome;

/**
 * The driving port behind the ADMIN refund-outbox surface: read what the registry still owes the
 * refund listener, and re-drive it on demand. Otherwise only an application restart re-reads a
 * failed or shed refund publication, so money owed to a tourist (invariant #10) waits for the
 * next deploy. A trigger and nothing more: eligibility, amount, gateway and bulkhead are untouched.
 * Internal: its only caller is this module's admin adapter (RESPONSIBILITIES.md §notification).
 */
public interface RefundResubmission {

	/** What an admin sees before pressing anything. */
	RefundOutboxStatus status();

	/**
	 * Re-drive every outstanding refund publication, once: the gateway adopts rather than
	 * duplicates a refund (RESPONSIBILITIES.md §payment), {@code markResubmitted} skips one in
	 * flight, and this port bounds the sweep, refusing with a typed {@link ResubmissionOutcome}.
	 */
	ResubmissionOutcome resubmit();
}
