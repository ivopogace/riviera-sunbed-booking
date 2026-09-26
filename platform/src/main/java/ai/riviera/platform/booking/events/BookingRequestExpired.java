package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A pending Request-to-Book hit its response deadline undecided: the expiry sweep's guarded
 * {@code PENDING_REQUEST → EXPIRED} transition committed and the {@code (set, date)} soft-hold was
 * released. Published by {@code RequestReleaseService}'s expire leg, one per expired row in its own
 * transaction. Payload rules are {@link BookingRequestDeclined}'s (no {@code venueId}, no code;
 * invariants #7, #11), never a {@code BookingCancelled}, and a separate event from the decline:
 * different guest copy ({@code CONTEXT.md}), counters never summed.
 */
public record BookingRequestExpired(BookingId bookingId, SetId setId, LocalDate bookingDate) {
}
