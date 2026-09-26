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
 * <p>A full recompute, never an increment, so at-least-once redelivery converges; the venue row is
 * locked first so concurrent recomputes of one venue serialize. Rationale: RESPONSIBILITIES.md
 * §venue. The venue is a {@link VenueId} here, converted to review's own ref at the port call.
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
		// Before the read, not after — that ordering is what makes concurrent recomputes converge.
		venues.lockForRecompute(venue);
		RatingSummary summary = reviews.summaryFor(new VenueRef(venue.value()));
		venues.store(venue, summary.ratingTenths(), summary.reviewsCount());
	}
}
