package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The facts the guarded check-in stamp returns via SQL {@code RETURNING} — present iff tonight's
 * night row really moved from unattended to attended. Identifies the booking by id, set and first
 * night so the caller never has to echo the code (invariant #7).
 */
public record CompletedCheckIn(long bookingId, SetId setId, LocalDate bookingDate) {
}
