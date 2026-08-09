package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * The committed state a losing check-in scan is classified against: the booking's current status
 * and service date, read after the guarded {@code UPDATE} matched 0 rows. Venue-scoped by the
 * query, so foreign-venue codes read as absent (non-enumerating, D-8 posture).
 */
public record CheckInFacts(BookingStatus status, LocalDate bookingDate) {
}
