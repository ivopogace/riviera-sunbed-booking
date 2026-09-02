package ai.riviera.platform.review.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.review.vocabulary.ReviewCursor;

/**
 * One page of a venue's reviews for moderation, newest first, and whether an older page follows —
 * the {@link ai.riviera.platform.review.vocabulary.ReviewPage} shape over the admin's row type.
 */
public record ModerationPage(List<ModeratedReview> reviews, boolean hasMore) {

	/** The cursor that reads the next older page, or empty when this page ends the list. */
	public Optional<ReviewCursor> next() {
		return hasMore ? Optional.of(ReviewCursor.after(reviews.getLast().ref())) : Optional.empty();
	}
}
