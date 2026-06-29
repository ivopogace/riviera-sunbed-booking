package ai.riviera.platform.payout.application.out;

import ai.riviera.platform.payout.domain.PayoutLedgerEntry;

/**
 * The {@code payout} module's outbound persistence port (driven seam) for the payout ledger.
 * Internal to the module — implemented by {@code JdbcPayoutLedger} (explicit SQL, invariant #1).
 */
public interface PayoutLedger {

	/**
	 * Record the ledger entry <strong>idempotently</strong>: an entry whose
	 * {@code (booking_id, entry_type)} already exists is a no-op (invariant #9). This is the
	 * exactly-once guarantee the async {@code BookingConfirmed} listener depends on — under the
	 * Event Publication Registry's at-least-once redelivery, accruing the same booking twice must
	 * not double-pay the venue. Implemented as {@code INSERT … ON CONFLICT DO NOTHING}.
	 */
	void accrue(PayoutLedgerEntry entry);
}
