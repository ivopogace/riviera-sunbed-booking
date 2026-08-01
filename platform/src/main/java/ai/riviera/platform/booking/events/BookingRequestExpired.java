package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A pending Request-to-Book reached its response deadline with no venue decision (issue #124): the
 * expiry sweep's guarded {@code PENDING_REQUEST → EXPIRED} transition committed and the
 * {@code (set, date)} soft-hold was released. Published from inside
 * {@code RequestReleaseService}'s expire leg, one per expired row in that row's own transaction —
 * a clean sweep publishes nothing.
 *
 * <p>Payload rules and the reasons behind them are {@link BookingRequestDeclined}'s, unchanged:
 * ids + the booking's date, no {@code venueId}, no code (invariants #7, #11), and deliberately not
 * a {@code BookingCancelled}. The two facts stay separate events — same shape, different reader
 * copy ("the venue said no" vs "nobody answered", {@code CONTEXT.md}) and separate abandonment
 * counters, never summed.
 */
public record BookingRequestExpired(BookingId bookingId, SetId setId, LocalDate bookingDate) {
}
