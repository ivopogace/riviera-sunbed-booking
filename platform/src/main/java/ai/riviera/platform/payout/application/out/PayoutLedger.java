package ai.riviera.platform.payout.application.out;

import java.util.Optional;

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

	/**
	 * The {@code ACCRUAL} entry for a booking, or empty if none exists yet — read by the cancellation
	 * reversal (U6) to mirror the accrual proportionally (ADR-0005). Empty means no reversal is posted
	 * (the booking was never accrued); cancellation happens long after confirmation, so the accrual is
	 * present in practice.
	 */
	Optional<PayoutLedgerEntry> findAccrual(long bookingId);

	/**
	 * Record a {@code REVERSAL} entry <strong>idempotently</strong> (U6): an entry whose
	 * {@code (booking_id, REVERSAL)} already exists is a no-op. Exactly-once under the registry's
	 * at-least-once redelivery (invariant #9), the reversal sibling of {@link #accrue}. Implemented as
	 * {@code INSERT … ON CONFLICT DO NOTHING}.
	 */
	void reverse(PayoutLedgerEntry entry);
}
