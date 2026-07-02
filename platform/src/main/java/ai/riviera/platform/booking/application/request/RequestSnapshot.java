package ai.riviera.platform.booking.application.request;

import java.time.Instant;

import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * A booking's request-relevant state, read to classify why a guarded accept/decline transition
 * matched no row: {@code status} says whether it is still {@code PENDING_REQUEST};
 * {@code requestExpiresAt} (null for an instant booking) whether its deadline has passed.
 * Venue-scoped read — a booking of another venue is treated as absent, so the outcome does not
 * disclose foreign bookings' existence (invariant #13).
 */
public record RequestSnapshot(BookingStatus status, Instant requestExpiresAt) {
}
