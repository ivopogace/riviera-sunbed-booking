package ai.riviera.platform.venue.application;

import java.time.YearMonth;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.VenueVisibility;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The fence in front of the public review list: a venue tourists cannot see (no {@code ACTIVE}
 * owner — which is also every venue that does not exist) has no list, and {@code review} is never
 * asked about it; a visible venue's page is {@code review}'s answer, passed through with the cursor
 * the caller gave.
 */
class ListVenueReviewsServiceTest {

	private static final VenueId VENUE = new VenueId(7);
	private static final ReviewPage PAGE = new ReviewPage(List.of(new ListedReview(new ReviewRef(41), 4,
			"Ana", YearMonth.of(2026, 7), "Great sunbeds")), false);

	private final FakeVisibility visibility = new FakeVisibility();
	private final FakeListedReviews listed = new FakeListedReviews();
	private final ListVenueReviews service = new ListVenueReviewsService(visibility, listed);

	@Test
	void fencesOnTouristVisibility() {
		assertEquals(Optional.empty(), service.pageFor(VENUE, ReviewCursor.FIRST_PAGE));
		assertEquals(0, listed.calls);
	}

	@Test
	void answersTheReviewPageForAVisibleVenue() {
		visibility.show(VENUE.value());

		assertEquals(Optional.of(PAGE), service.pageFor(VENUE, new ReviewCursor(40)));

		assertEquals(new ai.riviera.platform.review.vocabulary.VenueRef(7), listed.lastVenue);
		assertEquals(new ReviewCursor(40), listed.lastCursor);
	}

	/** Hidden unless shown — the port's fail-closed default, so an unknown venue is invisible too. */
	private static final class FakeVisibility implements VenueVisibility {

		private final Set<Long> visible = new HashSet<>();

		void show(long venueId) {
			visible.add(venueId);
		}

		@Override
		public boolean isVisible(VenueRef venue) {
			return visible.contains(venue.value());
		}

		@Override
		public Set<VenueRef> visibleAmong(Collection<VenueRef> venues) {
			return venues.stream().filter(this::isVisible).collect(Collectors.toSet());
		}
	}

	private static final class FakeListedReviews implements ListedReviews {

		private int calls;
		private ai.riviera.platform.review.vocabulary.VenueRef lastVenue;
		private ReviewCursor lastCursor;

		@Override
		public ReviewPage pageFor(ai.riviera.platform.review.vocabulary.VenueRef venue, ReviewCursor from) {
			calls++;
			lastVenue = venue;
			lastCursor = from;
			return PAGE;
		}
	}
}
