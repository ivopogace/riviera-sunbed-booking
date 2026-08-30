package ai.riviera.platform.review.application;

import java.time.Clock;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ReviewState;

/**
 * Answers {@link ReviewEligibility} by applying the same three fences the submit path applies, in
 * the same order — no stay, not checked in, frozen, already rated — so the view can never offer a
 * form the submit would refuse. Package-private behind the port (invariant #11); read-only, so no
 * {@code @Transactional}.
 */
@Service
class ReviewEligibilityService implements ReviewEligibility {

	private final CompletedStays stays;
	private final Reviews reviews;
	private final Clock clock;

	ReviewEligibilityService(CompletedStays stays, Reviews reviews, Clock clock) {
		this.stays = stays;
		this.reviews = reviews;
		this.clock = clock;
	}

	@Override
	public ReviewState stateFor(String bookingCode) {
		Optional<CompletedStay> found = stays.byCode(bookingCode);
		if (found.isEmpty()) {
			return stays.existsByCode(bookingCode) ? ReviewState.NOT_COMPLETED : ReviewState.NO_SUCH_STAY;
		}

		CompletedStay stay = found.get();
		// Window before rating: the submit path fences in that order, and the two must agree.
		if (!ReviewWindow.isOpen(stay.completedAt(), clock.instant())) {
			return ReviewState.WINDOW_CLOSED;
		}
		return reviews.existsFor(stay.booking())
				? ReviewState.ALREADY_REVIEWED
				: ReviewState.ELIGIBLE;
	}
}
