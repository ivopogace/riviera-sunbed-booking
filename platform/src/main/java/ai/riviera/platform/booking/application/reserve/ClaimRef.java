package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The set and span a booking was holding — returned by the guarded transitions that give its claim up
 * ({@link Bookings#cancelAwaitingPayment}, {@link Bookings#revertAcceptToPending}, among others) so
 * the caller releases one {@code (set, date)} row per day, {@code bookingDate} to {@code lastDate}
 * inclusive (invariant #2). Carries typed ids / values only (invariant #11). Internal to {@code booking}.
 */
public record ClaimRef(SetId setId, LocalDate bookingDate, LocalDate lastDate) {
}
