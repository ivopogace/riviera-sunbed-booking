package ai.riviera.platform.review.vocabulary;

import java.util.List;
import java.util.Optional;

/**
 * One page of a venue's listed reviews, newest first, and whether an older page follows. The page
 * size is the {@code review} module's contract, not the caller's choice.
 */
public record ReviewPage(List<ListedReview> reviews, boolean hasMore) {

	/** The cursor that reads the next older page, or empty when this page ends the list. */
	public Optional<ReviewCursor> next() {
		return hasMore ? Optional.of(ReviewCursor.after(reviews.getLast().ref())) : Optional.empty();
	}
}
