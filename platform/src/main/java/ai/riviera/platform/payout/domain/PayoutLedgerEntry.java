package ai.riviera.platform.payout.domain;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One payout-ledger entry for a booking (invariant #9), and the home of its commission arithmetic.
 * Money is integer minor units + ISO currency (invariant #5). Amounts are non-negative magnitudes;
 * direction lives in {@link EntryType}, never the sign. The constructor mirrors the DB's CHECKs,
 * {@code net = gross − commission} included, with the same {@code FEE} exemption keyed on the type
 * alone (as {@code payout_net_check} is). {@code reason} is {@code null} on an {@code ACCRUAL} and the
 * {@link RefundReason} otherwise.
 */
public record PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType,
		long grossMinor, long commissionMinor, long netMinor, String currency, RefundReason reason) {

	public PayoutLedgerEntry {
		if (venueId == null || entryType == null || currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("venueId, entryType and currency are required");
		}
		if (grossMinor < 0 || commissionMinor < 0 || netMinor < 0) {
			throw new IllegalArgumentException("amounts must be non-negative (minor units)");
		}
		if (entryType != EntryType.FEE && netMinor != grossMinor - commissionMinor) {
			throw new IllegalArgumentException("net must equal gross - commission");
		}
	}

	/**
	 * The {@code ACCRUAL} for a confirmed booking, split by {@link CommissionSplit} (commission
	 * rounded <strong>down</strong>, invariant #5) at {@code commissionBps}, the venue's live rate at
	 * accrual time.
	 */
	public static PayoutLedgerEntry accrual(VenueId venueId, long bookingId, long grossMinor,
			int commissionBps, String currency) {
		CommissionSplit split = CommissionSplit.of(grossMinor, commissionBps);
		return new PayoutLedgerEntry(venueId, bookingId, EntryType.ACCRUAL, split.grossMinor(),
				split.commissionMinor(), split.netMinor(), currency, null);
	}

	/**
	 * The {@code REVERSAL} mirroring the stored {@code accrual} pro rata to {@code refundMinor}:
	 * commission {@code floorDiv(accrual.commission × refundMinor, accrual.gross)}, rounded down
	 * (invariant #5); positive magnitudes (invariant #9). Never call it for a zero refund (ADR-0005).
	 */
	public static PayoutLedgerEntry reversalOf(PayoutLedgerEntry accrual, long refundMinor,
			RefundReason reason) {
		long commission = accrual.grossMinor() == 0 ? 0
				: Math.floorDiv(accrual.commissionMinor() * refundMinor, accrual.grossMinor());
		return new PayoutLedgerEntry(accrual.venueId(), accrual.bookingId(), EntryType.REVERSAL,
				refundMinor, commission, refundMinor - commission, accrual.currency(), reason);
	}

	/**
	 * The {@code FEE} for a refund the venue's own change caused: zero gross and commission, and
	 * {@code feeMinor} as the whole net (the shape {@code payout_net_check} exempts), a positive
	 * magnitude every payout sum deducts (invariant #9). Its reason is always {@code VENUE_CHANGE}.
	 */
	public static PayoutLedgerEntry fee(VenueId venueId, long bookingId, long feeMinor, String currency) {
		return new PayoutLedgerEntry(venueId, bookingId, EntryType.FEE, 0L, 0L, feeMinor, currency,
				RefundReason.VENUE_CHANGE);
	}
}
