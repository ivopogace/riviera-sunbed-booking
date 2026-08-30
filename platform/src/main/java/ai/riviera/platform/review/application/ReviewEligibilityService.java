package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.domain.ReviewGate;
import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewPanel;

/**
 * Answers {@link ReviewEligibility} from the same {@link ReviewGate} the write path consults, so
 * the view can never offer a form the submit would refuse — the two agree because they ask one
 * question, not because they were written alike. Package-private behind the port (invariant #11);
 * read-only, so no {@code @Transactional}.
 *
 * <p>The gate's verdict then picks the panel variant, and only the closed-window verdict needs the
 * stored review to choose: a frozen verdict is still worth reading back, a window nobody wrote in
 * has nothing to show.
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
	public ReviewPanel panelFor(String bookingCode) {
		Optional<CompletedStay> found = stays.byCode(bookingCode);
		Optional<OwnReview> review = found.flatMap(stay -> reviews.findFor(stay.booking()));
		return switch (ReviewGate.stateOf(found.isPresent() || stays.existsByCode(bookingCode),
				found.map(CompletedStay::completedAt).orElse(null), review.isPresent(),
				clock.instant())) {
			case NO_SUCH_STAY -> new ReviewPanel.NoSuchStay();
			case NOT_COMPLETED -> new ReviewPanel.NotCompleted();
			case WINDOW_CLOSED -> review.<ReviewPanel>map(ReviewPanel.Frozen::new)
					.orElseGet(ReviewPanel.WindowClosed::new);
			case ALREADY_REVIEWED ->
					new ReviewPanel.AlreadyReviewed(review.orElseThrow(), closesFor(found.orElseThrow()));
			case ELIGIBLE -> new ReviewPanel.Eligible(closesFor(found.orElseThrow()));
		};
	}

	private static Instant closesFor(CompletedStay stay) {
		return ReviewWindow.closesAt(stay.completedAt());
	}
}
