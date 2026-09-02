package ai.riviera.platform.venue.application;

import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Answers {@link ListVenueReviews} by fencing first and delegating second: the tourist-visibility
 * rule ({@code operator.api.VenueVisibility}, the fence the beach-map read applies) decides whether
 * there is a list at all, and {@code review.api.ListedReviews} decides what is on it. The fence sits
 * here rather than in the controller so no driving adapter can serve the list around it.
 * Package-private behind the port (invariant #11); read-only, so no {@code @Transactional}.
 */
@Service
class ListVenueReviewsService implements ListVenueReviews {

	private final VenueVisibility visibility;
	private final ListedReviews listed;

	ListVenueReviewsService(VenueVisibility visibility, ListedReviews listed) {
		this.visibility = visibility;
		this.listed = listed;
	}

	@Override
	public Optional<ReviewPage> pageFor(VenueId venue, ReviewCursor from) {
		if (!visibility.isVisible(new VenueRef(venue.value()))) {
			return Optional.empty();
		}
		return Optional.of(listed.pageFor(
				new ai.riviera.platform.review.vocabulary.VenueRef(venue.value()), from));
	}
}
