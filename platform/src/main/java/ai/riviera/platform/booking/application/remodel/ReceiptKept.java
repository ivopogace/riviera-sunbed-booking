package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BlockReason;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;

/**
 * One claim a commit receipt records as kept where it was — neither moved nor ended, its set left
 * as stored: which booking, on which day, the spot it holds as a label snapshot, and why the remodel
 * could not settle it otherwise. Module-internal; public for the module's own adapters.
 */
public record ReceiptKept(BookingId bookingId, LocalDate bookingDate, SpotRef spot, BlockReason reason) {
}
