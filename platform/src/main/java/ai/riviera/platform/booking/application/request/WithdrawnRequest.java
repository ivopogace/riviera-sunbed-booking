package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The facts the guarded withdraw transition {@code RETURNING}s: the set and span to release, one
 * {@code (set, date)} per day (invariant #2), plus the booking's own id.
 *
 * <p>It carries the id where {@code ClaimRef} does not: the withdraw is keyed on the booking
 * <strong>code</strong>, a bearer credential that must never reach a log line (invariant #7), so
 * the id comes back for logging without a second read. Typed ids only (invariant #11); internal to
 * {@code booking}.
 */
public record WithdrawnRequest(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate) {
}
