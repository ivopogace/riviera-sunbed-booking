package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;

/**
 * One claim a commit receipt records as ended rather than moved: which booking, on which day, the
 * spot it held as a label snapshot — the save may retire that set — what became of it, and the
 * amount involved in integer minor units (invariant #5). A {@link ReceiptOutcomeKind#RELEASE} or
 * {@link ReceiptOutcomeKind#DECLINE} collected nothing, so its amount is what was never charged.
 * Module-internal; public for the module's own adapters.
 */
public record ReceiptOutcome(BookingId bookingId, LocalDate bookingDate, SpotRef spot,
		ReceiptOutcomeKind kind, long amountMinor, String currency) {
}
