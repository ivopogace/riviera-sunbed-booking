package ai.riviera.platform.review.vocabulary;

import java.time.Instant;
import java.time.LocalDate;

/**
 * The completed-stay facts {@link ai.riviera.platform.review.spi.CompletedStays} answers with: which
 * booking, at which venue, on which day, and when the stay completed. The presence of this value
 * <em>is</em> the completed fact — the port yields nothing for a booking in any other status, so
 * {@code booking}'s {@code BookingStatus} enum stays internal to {@code booking}.
 *
 * @param booking     the reviewed stay's booking
 * @param venue       the venue whose aggregate a review of this stay moves
 * @param stayedOn    the stay's first night (a {@code Europe/Tirane} civil day, invariant #6) —
 *                    recorded on the review so its public listing can name the month
 * @param completedAt the instant the stay completed (UTC, invariant #6) — its last night checked
 *                    in or passed after an attended one — which the 60-day review window runs from
 */
public record CompletedStay(BookingRef booking, VenueRef venue, LocalDate stayedOn,
		Instant completedAt) {
}
