package ai.riviera.platform.venue.adapter.in;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.venue.application.RecomputeVenueRating;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Refreshes the venue's {@code rating_tenths}/{@code reviews_count} on {@code review}'s
 * {@code ReviewsChanged} event (invariant #11). {@code @ApplicationModuleListener}: runs after the
 * review commits, in its own transaction, so a failure never rolls back a review; delivery is
 * at-least-once, so the recompute is idempotent — it re-reads the whole review set through
 * {@code review::api} and overwrites, taking only the venue id from the event.
 * Rationale: RESPONSIBILITIES.md §venue.
 */
@Component
class ReviewsChangedListener {

	private final RecomputeVenueRating ratings;

	ReviewsChangedListener(RecomputeVenueRating ratings) {
		this.ratings = ratings;
	}

	@ApplicationModuleListener
	void on(ReviewsChanged event) {
		ratings.recompute(new VenueId(event.venue().value()));
	}
}
