package ai.riviera.platform.review.vocabulary;

import java.time.Instant;

/**
 * The completed-stay facts {@link ai.riviera.platform.review.spi.CompletedStays} answers with: which
 * booking, at which venue, and when it was checked in. The presence of this value <em>is</em> the
 * completed fact — the port yields nothing for a booking in any other status, so {@code booking}'s
 * {@code BookingStatus} enum stays internal to {@code booking}.
 *
 * @param booking     the reviewed stay's booking
 * @param venue       the venue whose aggregate a review of this stay moves
 * @param completedAt the check-in instant (UTC, invariant #6) the 60-day review window runs from
 */
public record CompletedStay(BookingRef booking, VenueRef venue, Instant completedAt) {
}
