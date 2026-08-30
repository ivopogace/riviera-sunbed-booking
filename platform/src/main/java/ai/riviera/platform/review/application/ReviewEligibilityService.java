package ai.riviera.platform.review.application;

import java.time.Clock;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.domain.ReviewGate;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ReviewState;

/**
 * Answers {@link ReviewEligibility} from the same {@link ReviewGate} the write path consults, so
 * the view can never offer a form the submit would refuse — the two agree because they ask one
 * question, not because they were written alike. Package-private behind the port (invariant #11);
 * read-only, so no {@code @Transactional}.
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
		return ReviewGate.stateOf(found.isPresent() || stays.existsByCode(bookingCode),
				found.map(CompletedStay::completedAt).orElse(null),
				found.isPresent() && reviews.existsFor(found.get().booking()), clock.instant());
	}
}
