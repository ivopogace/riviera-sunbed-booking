package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.review.domain.ReviewGate;
import ai.riviera.platform.review.domain.Stars;
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.domain.ReviewState;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

/**
 * The one service behind {@link ReviewLifecycle}: resolve the stay behind the code, ask
 * {@link ReviewGate} where it stands, act, and announce that the venue's aggregate moved.
 * Package-private behind the port (invariant #11).
 *
 * <p>Every rejection a caller can provoke with a legitimate request is a typed outcome, not an
 * exception — including a lost uniqueness race, which is ordinary flow here. An out-of-range rating
 * is the exception to that: the driving adapter rejects it as a {@code 400} before this port is
 * reached, so one arriving here is a caller bug. The guard buys the failure's <em>location</em>,
 * not its status.
 *
 * <p>The claim's row count is the answer, so there is no read-then-write window for a second submit
 * to slip through; {@code ReviewUniquenessIT} proves it under real concurrency. The event is
 * published inside the transaction and delivered after commit by the Event Publication Registry.
 */
@Service
class ReviewLifecycleService implements ReviewLifecycle {

	private final CompletedStays stays;
	private final Reviews reviews;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	ReviewLifecycleService(CompletedStays stays, Reviews reviews, ApplicationEventPublisher events,
			Clock clock) {
		this.stays = stays;
		this.reviews = reviews;
		this.events = events;
		this.clock = clock;
	}

	@Override
	@Transactional
	public SubmitOutcome submit(String bookingCode, ReviewSubmission submission) {
		if (!Stars.isValid(submission.stars())) {
			throw new IllegalArgumentException(Stars.SCALE_DESCRIPTION);
		}
		Optional<CompletedStay> found = stays.byCode(bookingCode);
		Instant now = clock.instant();
		return switch (stateOf(bookingCode, found, now)) {
			case NO_SUCH_STAY -> new SubmitOutcome.NoSuchStay();
			case NOT_COMPLETED -> new SubmitOutcome.NotEligible();
			case WINDOW_CLOSED -> new SubmitOutcome.WindowClosed();
			case ALREADY_REVIEWED -> new SubmitOutcome.AlreadyReviewed();
			case ELIGIBLE -> claim(found.orElseThrow(), submission, now);
		};
	}

	@Override
	@Transactional
	public AmendOutcome edit(String bookingCode, ReviewSubmission submission) {
		if (!Stars.isValid(submission.stars())) {
			throw new IllegalArgumentException(Stars.SCALE_DESCRIPTION);
		}
		return amend(bookingCode, (stay, at) -> reviews.update(stay.booking(), submission.stars(),
				submission.comment(), submission.displayName(), at));
	}

	@Override
	@Transactional
	public AmendOutcome delete(String bookingCode) {
		return amend(bookingCode, (stay, at) -> reviews.delete(stay.booking()));
	}

	/**
	 * The half of an amend that both verbs share: the gate decides, and only a stay that already
	 * carries a review is amendable — so {@code ELIGIBLE}, which means "no review yet", is this
	 * path's {@code NoSuchReview} rather than its go-ahead.
	 */
	private AmendOutcome amend(String bookingCode, AmendWrite write) {
		Optional<CompletedStay> found = stays.byCode(bookingCode);
		Instant now = clock.instant();
		return switch (stateOf(bookingCode, found, now)) {
			case NO_SUCH_STAY -> new AmendOutcome.NoSuchStay();
			case NOT_COMPLETED -> new AmendOutcome.NotEligible();
			case WINDOW_CLOSED -> new AmendOutcome.WindowClosed();
			case ELIGIBLE -> new AmendOutcome.NoSuchReview();
			case ALREADY_REVIEWED -> write(found.orElseThrow(), write, now);
		};
	}

	private AmendOutcome write(CompletedStay stay, AmendWrite write, Instant now) {
		if (!write.to(stay, now)) {
			return new AmendOutcome.NoSuchReview();
		}
		events.publishEvent(new ReviewsChanged(stay.venue()));
		return new AmendOutcome.Done();
	}

	private SubmitOutcome claim(CompletedStay stay, ReviewSubmission submission, Instant now) {
		if (!reviews.claim(stay.booking(), stay.venue(), submission.stars(), submission.comment(),
				submission.displayName(), now)) {
			return new SubmitOutcome.AlreadyReviewed();
		}
		events.publishEvent(new ReviewsChanged(stay.venue()));
		return new SubmitOutcome.Submitted();
	}

	private ReviewState stateOf(String bookingCode, Optional<CompletedStay> found, Instant now) {
		return ReviewGate.stateOf(found.isPresent() || stays.existsByCode(bookingCode),
				found.map(CompletedStay::completedAt).orElse(null),
				found.isPresent() && reviews.existsFor(found.get().booking()), now);
	}

	/**
	 * The row write an amend performs once the gate has cleared it. {@code false} means no row
	 * answered to the booking any more — a concurrent delete won, which the caller reports as
	 * {@code NoSuchReview} rather than as a failure.
	 */
	private interface AmendWrite {

		boolean to(CompletedStay stay, Instant at);
	}
}
