package ai.riviera.platform.review.application;

import org.springframework.stereotype.Service;

import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.domain.AggregateRating;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * Answers {@link VenueRatingSummary} by taking the store's totals through the rounding rule.
 * Package-private behind the port (invariant #11); read-only, so no {@code @Transactional}.
 *
 * <p>The mean is taken here rather than in SQL so the rounding direction is stated once, in
 * {@link AggregateRating}, where a test can reach it.
 */
@Service
class VenueRatingSummaryService implements VenueRatingSummary {

	private final Reviews reviews;

	VenueRatingSummaryService(Reviews reviews) {
		this.reviews = reviews;
	}

	@Override
	public RatingSummary summaryFor(VenueRef venue) {
		ReviewTotals totals = reviews.totalsFor(venue);
		return new RatingSummary(AggregateRating.tenths(totals.sumStars(), totals.count()),
				totals.count());
	}
}
