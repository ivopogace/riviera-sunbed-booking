package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the operator's pending-requests queue (issue #98). Deliberately carries the
 * booking's technical id and <strong>no booking code</strong> — the code is the guest's bearer
 * credential (invariant #7) and the operator does not need it before the booking is confirmed;
 * accept/decline act by id. {@code guestName} is resolved via the {@code customer::api} port;
 * the set is a typed id the staff UI correlates with its map (invariant #11). Money in integer
 * minor units (invariant #5).
 */
public record PendingRequest(long bookingId, SetId setId, LocalDate bookingDate, String guestName,
		long amountMinor, String currency, Instant requestedAt, Instant requestExpiresAt) {
}
