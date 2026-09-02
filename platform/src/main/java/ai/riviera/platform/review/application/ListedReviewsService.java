package ai.riviera.platform.review.application;

import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * Answers {@link ListedReviews} by reading one row past the page from the store: the extra row is
 * how the page learns an older page exists, without a second count query. Package-private behind
 * the port (invariant #11); read-only, so no {@code @Transactional}.
 */
@Service
class ListedReviewsService implements ListedReviews {

	/** Reviews per page — the port's contract, fixed here rather than taken from a caller. */
	static final int PAGE_SIZE = 10;

	private final Reviews reviews;

	ListedReviewsService(Reviews reviews) {
		this.reviews = reviews;
	}

	@Override
	public ReviewPage pageFor(VenueRef venue, ReviewCursor from) {
		List<ListedReview> rows = reviews.newestListedBefore(venue, from.beforeId(), PAGE_SIZE + 1);
		boolean hasMore = rows.size() > PAGE_SIZE;
		return new ReviewPage(hasMore ? List.copyOf(rows.subList(0, PAGE_SIZE)) : rows, hasMore);
	}
}
