package ai.riviera.platform.payout.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code payout} module's outbound persistence port (driven seam) for the payout ledger.
 * Internal to the module — implemented by {@code JdbcPayoutLedger} (explicit SQL, invariant #1).
 */
public interface PayoutLedger {

	/**
	 * Record an entry <strong>idempotently</strong> ({@code INSERT … ON CONFLICT DO NOTHING}): an
	 * existing {@code (booking_id, entry_type)} is a no-op, so the registry's at-least-once redelivery
	 * of {@code BookingConfirmed} never double-pays the venue (invariant #9).
	 */
	void accrue(PayoutLedgerEntry entry);

	/**
	 * The booking's {@code ACCRUAL}, which a reversal mirrors proportionally. <strong>Empty means
	 * "not yet", never "nothing to reverse"</strong>: the caller must defer (throw, so the publication
	 * retries) or the ledger overstates what the venue is owed (ADR-0005, invariant #9).
	 */
	Optional<PayoutLedgerEntry> findAccrual(long bookingId);

	/**
	 * Record a {@code REVERSAL} <strong>idempotently</strong>, like {@link #accrue}: an existing
	 * {@code (booking_id, REVERSAL)} is a no-op, so redelivery reverses exactly once (invariant #9).
	 */
	void reverse(PayoutLedgerEntry entry);

	/**
	 * Record a {@code FEE} <strong>idempotently</strong>, like {@link #accrue}: an existing
	 * {@code (booking_id, FEE)} is a no-op, so redelivery charges exactly once (invariant #9).
	 */
	void charge(PayoutLedgerEntry entry);

	/**
	 * Every entry for {@code venueId}, of every type, oldest first ({@code created_at}, then
	 * {@code id}); the caller folds the running net owed in this order. Empty when the venue has no
	 * entries yet.
	 */
	List<LedgerEntryRow> entriesForVenue(VenueId venueId);

	/**
	 * Per venue with any entry in {@code period}: {@code Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net}
	 * in minor units (invariant #5), possibly negative; a venue netting to zero still appears. Empty
	 * when no entry falls in the period.
	 */
	List<VenuePeriodTotal> netTotalsForPeriod(PeriodKey period);

	/**
	 * Per venue with a {@code reason = 'VENUE_CHANGE'} refund: the count, the {@code REVERSAL}s' gross
	 * and the {@code FEE}s' net in minor units (invariant #5), separate aggregates never to be added.
	 * Empty when no venue-caused refund has been posted.
	 */
	List<VenueChangeRefundTotal> venueChangeTotals();
}
