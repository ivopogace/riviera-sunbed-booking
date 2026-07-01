package ai.riviera.platform.payout.domain;

import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One payout-ledger entry — what the platform owes a venue for a booking (invariant #9). A value
 * object: immutable, transparent, and the home of the commission arithmetic so the math lives with
 * the data it produces rather than scattered in an adapter.
 *
 * <p>Money is integer minor units + ISO currency (invariant #5); {@code net = gross − commission}.
 * The canonical constructor guards the amount invariants the DB also enforces (defence in depth) so
 * a malformed entry can never be constructed in the first place. {@code reason} is {@code null} on an
 * {@code ACCRUAL} and carries the {@link RefundReason} (POLICY/WEATHER) on a {@code REVERSAL} (U9) so
 * the ledger stays auditable.
 */
public record PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType,
		long grossMinor, long commissionMinor, long netMinor, String currency, RefundReason reason) {

	private static final long BPS_DENOMINATOR = 10_000L;

	public PayoutLedgerEntry {
		if (venueId == null || entryType == null || currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("venueId, entryType and currency are required");
		}
		if (grossMinor < 0 || commissionMinor < 0 || netMinor < 0) {
			throw new IllegalArgumentException("amounts must be non-negative (minor units)");
		}
		if (netMinor != grossMinor - commissionMinor) {
			throw new IllegalArgumentException("net must equal gross - commission");
		}
	}

	/**
	 * Build the {@code ACCRUAL} entry for a confirmed booking. Commission is exact integer minor
	 * units, rounded <strong>down</strong> (invariant #5 — division happens here, so the direction
	 * is written down): {@code commission = floorDiv(gross × bps, 10000)}; the venue keeps the
	 * sub-cent remainder ({@code net = gross − commission}). {@code bps} is the venue's commission
	 * rate in basis points (1500 = 15.00%), read from {@code venue::api} at accrual time.
	 */
	public static PayoutLedgerEntry accrual(VenueId venueId, long bookingId, long grossMinor,
			int commissionBps, String currency) {
		long commission = Math.floorDiv(grossMinor * commissionBps, BPS_DENOMINATOR);
		return new PayoutLedgerEntry(venueId, bookingId, EntryType.ACCRUAL, grossMinor, commission,
				grossMinor - commission, currency, null);
	}

	/**
	 * Build the {@code REVERSAL} entry that backs out (part of) an {@code accrual} when a booking is
	 * refunded (U6, ADR-0005). <strong>Proportional to the refund</strong>: the reversal's gross is
	 * the {@code refundMinor}, and its commission is the same fraction of the accrual's commission —
	 * {@code floorDiv(accrual.commission × refundMinor, accrual.gross)} — so a full refund
	 * ({@code refundMinor == accrual.gross}) reverses the whole accrual and a partial refund reverses
	 * the matching share. Stored as <strong>positive</strong> magnitudes (the V9 CHECK forbids
	 * negatives); the sign is carried by {@link EntryType#REVERSAL} for the payout sum (invariant #9).
	 * Rounds <strong>down</strong> like the accrual (invariant #5). Caller must not reverse a zero
	 * refund (ADR-0005: no refund ⇒ no reversal). {@code reason} (POLICY/WEATHER, U9) is recorded on
	 * the reversal for audit; it does not affect the arithmetic.
	 */
	public static PayoutLedgerEntry reversalOf(PayoutLedgerEntry accrual, long refundMinor,
			RefundReason reason) {
		long commission = accrual.grossMinor() == 0 ? 0
				: Math.floorDiv(accrual.commissionMinor() * refundMinor, accrual.grossMinor());
		return new PayoutLedgerEntry(accrual.venueId(), accrual.bookingId(), EntryType.REVERSAL,
				refundMinor, commission, refundMinor - commission, accrual.currency(), reason);
	}
}
