package ai.riviera.platform.payout.domain;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One payout-ledger entry for a booking (invariant #9), and the home of its commission arithmetic.
 * Money is integer minor units + ISO currency (#5); amounts are non-negative magnitudes, direction is
 * the {@link EntryType}. The constructor mirrors the DB's CHECKs: {@code net = gross − commission} but
 * for a {@code FEE}, {@code reason} null only on an {@code ACCRUAL}, {@code serviceDate} only on a
 * {@code DAY_REVERSAL} ({@code payout_service_date_check}).
 */
public record PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType,
		long grossMinor, long commissionMinor, long netMinor, String currency, RefundReason reason,
		LocalDate serviceDate) {

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
		if ((entryType == EntryType.DAY_REVERSAL) != (serviceDate != null)) {
			throw new IllegalArgumentException("a DAY_REVERSAL names its day; no other type does");
		}
	}

	/** A dateless entry: any type but {@code DAY_REVERSAL}. */
	public PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType, long grossMinor,
			long commissionMinor, long netMinor, String currency, RefundReason reason) {
		this(venueId, bookingId, entryType, grossMinor, commissionMinor, netMinor, currency, reason, null);
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
		return reversalOf(accrual, refundMinor, reason, Reversed.NONE);
	}

	/**
	 * {@link #reversalOf(PayoutLedgerEntry, long, RefundReason)} after earlier reversals took {@code prior}:
	 * pro rata, except that the reversal reaching the accrual's gross returns every cent of commission
	 * still held, so a booking reversed in parts nets exactly zero (invariant #9).
	 */
	public static PayoutLedgerEntry reversalOf(PayoutLedgerEntry accrual, long refundMinor,
			RefundReason reason, Reversed prior) {
		long commission = commissionOn(accrual, refundMinor, prior);
		return new PayoutLedgerEntry(accrual.venueId(), accrual.bookingId(), EntryType.REVERSAL,
				refundMinor, commission, refundMinor - commission, accrual.currency(), reason);
	}

	/**
	 * The {@code DAY_REVERSAL} of one service day's share, always for weather: the same arithmetic as
	 * {@link #reversalOf(PayoutLedgerEntry, long, RefundReason, Reversed)}, keyed by {@code serviceDate}.
	 */
	public static PayoutLedgerEntry dayReversalOf(PayoutLedgerEntry accrual, LocalDate serviceDate,
			long refundMinor, Reversed prior) {
		long commission = commissionOn(accrual, refundMinor, prior);
		return new PayoutLedgerEntry(accrual.venueId(), accrual.bookingId(), EntryType.DAY_REVERSAL,
				refundMinor, commission, refundMinor - commission, accrual.currency(), RefundReason.WEATHER,
				serviceDate);
	}

	private static long commissionOn(PayoutLedgerEntry accrual, long refundMinor, Reversed prior) {
		if (accrual.grossMinor() == 0) {
			return 0;
		}
		if (prior.grossMinor() + refundMinor >= accrual.grossMinor()) {
			return accrual.commissionMinor() - prior.commissionMinor();
		}
		return Math.floorDiv(accrual.commissionMinor() * refundMinor, accrual.grossMinor());
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
