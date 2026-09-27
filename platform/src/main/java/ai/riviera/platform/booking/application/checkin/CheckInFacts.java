package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The committed state a losing check-in scan is classified against, read after the guarded {@code
 * UPDATE} matched 0 rows: the booking's status, its first service day, its set and whether today's
 * service day is already attended — what tells a second scan on one service day of a live stay from a
 * scan on a day the stay does not cover. For a stay, the stretch nearest today. Venue-scoped by the
 * query, so foreign-venue codes read as absent (non-enumerating, D-8 posture).
 */
public record CheckInFacts(BookingStatus status, LocalDate bookingDate, SetId setId, boolean attendedToday) {
}
