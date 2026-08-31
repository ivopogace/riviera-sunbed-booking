package ai.riviera.platform.venue.adapter.in;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.venue.application.RecomputeVenueRating;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's reaction to its review set moving — a driving adapter listening for the
 * {@code ReviewsChanged} fact the {@code review} module announces (invariant #11: collaboration by
 * published event, never a call into {@code review}'s internals). It refreshes the venue's own
 * {@code rating_tenths}/{@code reviews_count}; {@code venue} stays the sole writer of its table.
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (= {@code @Async} +
 * {@code @Transactional} + {@code @TransactionalEventListener(AFTER_COMMIT)}): the publication is
 * persisted by the Event Publication Registry when the submit's transaction commits, then this runs
 * after commit in its own transaction. A recompute failure therefore never rolls back a recorded
 * review, and an incomplete publication is re-submitted (at-least-once). Because delivery is
 * at-least-once, the recompute is <strong>idempotent</strong>: it re-reads the venue's whole review
 * set and overwrites, so a redelivered event lands on the same numbers.
 *
 * <p>Nothing is taken from the event but the venue id — the aggregate is re-read through
 * {@code review::api}, the same discipline {@code BookingConfirmedPayoutListener} applies to the
 * commission rate. DB-only work, so it runs on the shared executor.
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
