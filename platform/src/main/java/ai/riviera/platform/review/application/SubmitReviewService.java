package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

/**
 * The rate-a-stay use case: resolve the stay behind the code, apply the eligibility and window
 * fences, claim the booking's one review slot, and announce that the venue's aggregate moved.
 * Package-private behind the {@link SubmitReview} port (invariant #11).
 *
 * <p>Every rejection is a typed {@link SubmitOutcome}, not an exception — including a lost
 * uniqueness race, which is ordinary flow here. The claim's row count is the answer, so there is no
 * read-then-write window for a second submit to slip through; {@code ReviewUniquenessIT} proves it
 * under real concurrency.
 *
 * <p>The event is published inside the transaction and delivered after commit by the Event
 * Publication Registry, from the facts the claim already had — never a second read.
 */
@Service
class SubmitReviewService implements SubmitReview {

	private final CompletedStays stays;
	private final Reviews reviews;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	SubmitReviewService(CompletedStays stays, Reviews reviews, ApplicationEventPublisher events,
			Clock clock) {
		this.stays = stays;
		this.reviews = reviews;
		this.events = events;
		this.clock = clock;
	}

	@Override
	@Transactional
	public SubmitOutcome submit(String bookingCode, int stars) {
		Optional<CompletedStay> found = stays.byCode(bookingCode);
		if (found.isEmpty()) {
			return stays.existsByCode(bookingCode)
					? new SubmitOutcome.NotEligible()
					: new SubmitOutcome.NoSuchStay();
		}

		CompletedStay stay = found.get();
		Instant now = clock.instant();
		if (!ReviewWindow.isOpen(stay.completedAt(), now)) {
			return new SubmitOutcome.WindowClosed();
		}
		if (!reviews.claim(stay.booking(), stay.venue(), stars, now)) {
			return new SubmitOutcome.AlreadyReviewed();
		}

		events.publishEvent(new ReviewsChanged(stay.venue()));
		return new SubmitOutcome.Submitted();
	}
}
