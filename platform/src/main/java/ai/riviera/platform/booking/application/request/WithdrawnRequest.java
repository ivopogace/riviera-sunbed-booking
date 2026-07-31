package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The facts the guarded withdraw transition {@code RETURNING}s (issue #123): the {@code (set, date)}
 * to release (invariant #2) plus the booking's own id.
 *
 * <p>It carries the id where {@code ClaimRef} does not, because the withdraw is the one terminal leg
 * keyed on the booking <strong>code</strong> rather than the id — decline and expire are handed the
 * id by their caller. Returning it keeps the id available for logging without a second read, which
 * matters here: the code that identifies the booking to the caller is a bearer credential and must
 * never reach a log line (invariant #7). Typed ids only (invariant #11); internal to {@code booking}.
 */
public record WithdrawnRequest(long bookingId, SetId setId, LocalDate bookingDate) {
}
