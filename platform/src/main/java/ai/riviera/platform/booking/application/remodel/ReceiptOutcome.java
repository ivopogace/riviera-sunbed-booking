package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;

/**
 * One claim a commit receipt records as ended rather than moved: which booking, on which day, the
 * spot it held as a label snapshot (the save may retire that set), what became of it, and the
 * amount in integer minor units (invariant #5) — for a {@link ReceiptOutcomeKind#RELEASE} or
 * {@link ReceiptOutcomeKind#DECLINE}, what was never charged. {@code feeMinor} is the venue's
 * charge for this ending, snapshotted at commit rather than read at today's rate; only a
 * {@link ReceiptOutcomeKind#REFUND} bears one. Module-internal; public for the module's adapters.
 */
public record ReceiptOutcome(BookingId bookingId, LocalDate bookingDate, SpotRef spot,
		ReceiptOutcomeKind kind, long amountMinor, String currency, long feeMinor) {

	public ReceiptOutcome {
		if (feeMinor < 0 || (kind != ReceiptOutcomeKind.REFUND && feeMinor != 0)) {
			throw new IllegalArgumentException("only a REFUND bears a fee, and never a negative one");
		}
	}
}
