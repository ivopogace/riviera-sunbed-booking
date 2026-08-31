package ai.riviera.platform.review.api;

import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * A venue's rating aggregated over its visible reviews — the answer {@code venue} stores in its own
 * columns after learning, through {@link ai.riviera.platform.review.events.ReviewsChanged}, that its
 * review set moved.
 *
 * <p>Deliberately a <em>pull</em> rather than a payload: the event carries ids only (invariant #11),
 * and re-reading here is what makes an at-least-once redelivery converge on the same answer instead
 * of drifting (the {@code BookingConfirmedPayoutListener} discipline).
 */
public interface VenueRatingSummary {

	/** The venue's mean rating in tenths and its review count; {@code 0/0} for a venue with none. */
	RatingSummary summaryFor(VenueRef venue);
}
