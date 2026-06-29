package ai.riviera.platform.booking.application.out;

import java.time.LocalDate;

import ai.riviera.platform.venue.api.SetId;

/**
 * The {@code (set, date)} a cancelled booking was holding — returned by
 * {@link Bookings#cancelAwaitingPayment} so the caller can release the availability claim
 * (invariant #2). Carries typed ids / value only (invariant #11). Internal to {@code booking}.
 */
public record ClaimRef(SetId setId, LocalDate bookingDate) {
}
