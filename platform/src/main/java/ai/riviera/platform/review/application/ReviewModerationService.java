package ai.riviera.platform.review.application;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * The one service behind {@link ReviewModeration}. Package-private behind the port (invariant #11).
 *
 * <p>Each verb is a single conditional update whose answer — the venue whose aggregate just moved,
 * or nothing — is the outcome: a row already in the requested state matches no predicate, so a
 * repeat neither writes nor publishes. Only when nothing changed is the store asked whether the
 * review exists at all, to tell "already so" from "no such review". The event is published inside
 * the transaction and delivered after commit by the Event Publication Registry.
 */
@Service
class ReviewModerationService implements ReviewModeration {

	private final Reviews reviews;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	ReviewModerationService(Reviews reviews, ApplicationEventPublisher events, Clock clock) {
		this.reviews = reviews;
		this.events = events;
		this.clock = clock;
	}

	@Override
	public ModerationPage pageFor(VenueRef venue, ReviewCursor from) {
		int pageSize = ListedReviewsService.PAGE_SIZE;
		List<ModeratedReview> rows = reviews.newestForModerationBefore(venue, from.beforeId(), pageSize + 1);
		boolean hasMore = rows.size() > pageSize;
		return new ModerationPage(hasMore ? List.copyOf(rows.subList(0, pageSize)) : rows, hasMore);
	}

	@Override
	@Transactional
	public ModerationOutcome hide(ReviewRef review) {
		return outcomeOf(review, reviews.hide(review, clock.instant()));
	}

	@Override
	@Transactional
	public ModerationOutcome unhide(ReviewRef review) {
		return outcomeOf(review, reviews.unhide(review));
	}

	private ModerationOutcome outcomeOf(ReviewRef review, Optional<VenueRef> moved) {
		if (moved.isPresent()) {
			events.publishEvent(new ReviewsChanged(moved.get()));
			return new ModerationOutcome.Applied();
		}
		return reviews.existsById(review)
				? new ModerationOutcome.AlreadyApplied()
				: new ModerationOutcome.NoSuchReview();
	}
}
