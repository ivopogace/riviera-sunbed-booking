package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;

/** A move the reminder stamp won: the stay, the stretch the guest arrives on and its first day. */
public record DueMove(StayId stayId, BookingId bookingId, LocalDate moveDate) {
}
