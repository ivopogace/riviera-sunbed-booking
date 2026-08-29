package ai.riviera.platform.venue.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Brings a venue's stored rating back in line with its reviews: ask {@code review} what the venue's
 * whole review set now says, write the answer to the venue's own columns.
 *
 * <p>A <strong>full recompute</strong>, never an increment — which is what makes it safe under the
 * registry's at-least-once delivery: running it twice, or out of order against a concurrent submit,
 * converges on the same row. Nothing is read off the event; the numbers come from the port.
 *
 * <p>The venue is named here in venue's own {@link VenueId} and converted at the port call, the
 * conversion {@code review.vocabulary.VenueRef} exists for — review publishes its own ref precisely
 * so this module can be its consumer without the graph cycling.
 */
@Service
class VenueRatingService implements RecomputeVenueRating {

	private final VenueRatingSummary reviews;
	private final VenueRatings venues;

	VenueRatingService(VenueRatingSummary reviews, VenueRatings venues) {
		this.reviews = reviews;
		this.venues = venues;
	}

	@Override
	@Transactional
	public void recompute(VenueId venue) {
		RatingSummary summary = reviews.summaryFor(new VenueRef(venue.value()));
		venues.store(venue, summary.ratingTenths(), summary.reviewsCount());
	}
}
