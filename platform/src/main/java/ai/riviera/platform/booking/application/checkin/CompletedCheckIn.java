package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The facts the guarded check-in transition returns via SQL {@code RETURNING} — present iff a row
 * really moved {@code CONFIRMED → COMPLETED}. Identifies the booking by id and set/date so the
 * caller never has to echo the code (invariant #7).
 */
public record CompletedCheckIn(long bookingId, SetId setId, LocalDate bookingDate) {
}
