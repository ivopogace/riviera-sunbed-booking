package ai.riviera.platform.review.vocabulary;

import java.time.Instant;
import java.time.LocalDate;

/**
 * The facts {@link ai.riviera.platform.review.spi.CompletedStays} answers with; the port yields
 * nothing for any other booking status, so this value's presence <em>is</em> the completed fact.
 *
 * @param booking     the reviewed stay's booking
 * @param venue       the venue whose aggregate a review of this stay moves
 * @param stayedOn    first service day ({@code Europe/Tirane}, #6); the public list names its month
 * @param completedAt when booking resolved the stay completed (UTC, #6); starts the 60-day window
 */
public record CompletedStay(BookingRef booking, VenueRef venue, LocalDate stayedOn,
		Instant completedAt) {
}
