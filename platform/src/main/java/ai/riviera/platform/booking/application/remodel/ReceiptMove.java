package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;

/**
 * One moved booking on a commit receipt: which booking, on which day, from which spot to which, and
 * how far. Both spots are snapshots by label — the from-set may be retired or renumbered by the
 * save that moved the guest — so the mail and the guest's view name the spot as it was.
 * Module-internal; public for the module's own adapters.
 */
public record ReceiptMove(BookingId bookingId, LocalDate bookingDate, SpotRef from, SpotRef to,
		int rowsAway, int positionsAway) {
}
