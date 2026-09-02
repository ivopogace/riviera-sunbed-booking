package ai.riviera.platform.review;

import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The public listing read against real Postgres, through {@link ListedReviews}: which rows are listed
 * (commented, this venue's), in which order (newest first), how the cursor pages past the first ten,
 * and that a star-only review counts in the aggregate while staying off the list. The stay reaches
 * the port as a month — the row's day never leaves the adapter.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReviewListingFlowIT {

	private static final Instant CHECKED_IN = Instant.parse("2026-07-01T16:00:00Z");

	@Autowired
	ListedReviews listed;

	@Autowired
	VenueRatingSummary summary;

	@Autowired
	JdbcClient jdbc;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@Test
	void pagesNewestFirstPastTheFirstPage() {
		long venueId = fixtures.venue("Listing Flow Paging");
		List<Long> ids = new ArrayList<>();
		for (int i = 1; i <= 11; i++) {
			ids.add(commentedReview(venueId, "Comment " + i));
		}

		ReviewPage first = listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE);
		assertThat(idsOf(first)).containsExactlyElementsOf(ids.reversed().subList(0, 10));
		assertEquals(new ReviewCursor(ids.get(1)), first.next().orElseThrow());

		ReviewPage second = listed.pageFor(new VenueRef(venueId), first.next().orElseThrow());
		assertThat(idsOf(second)).containsExactly(ids.getFirst());
		assertThat(second.next()).isEmpty();
	}

	@Test
	void starOnlyReviewsCountButAreNotListed() {
		long venueId = fixtures.venue("Listing Flow Star Only");
		long first = commentedReview(venueId, "Lovely spot");
		fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), 3, null, null);
		long last = commentedReview(venueId, "Came back twice");

		ReviewPage page = listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE);

		assertThat(idsOf(page)).containsExactly(last, first);
		assertEquals(new RatingSummary(37, 3), summary.summaryFor(new VenueRef(venueId)));
	}

	@Test
	void listsTheStayAsAMonth() {
		long venueId = fixtures.venue("Listing Flow Month");
		long id = fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), 5, "Great sunbeds", "Ana");

		ReviewPage page = listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE);

		assertThat(page.reviews()).containsExactly(
				new ListedReview(new ReviewRef(id), 5, "Ana", YearMonth.of(2026, 7), "Great sunbeds"));
	}

	@Test
	void listsOnlyTheVenuesOwnReviews() {
		long venueId = fixtures.venue("Listing Flow Own");
		long otherVenueId = fixtures.venue("Listing Flow Other");
		long own = commentedReview(venueId, "Ours");
		commentedReview(otherVenueId, "Theirs");

		assertThat(idsOf(listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE))).containsExactly(own);
	}

	private long commentedReview(long venueId, String comment) {
		return fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), 4, comment, "Guest");
	}

	private static List<Long> idsOf(ReviewPage page) {
		return page.reviews().stream().map(r -> r.ref().value()).toList();
	}
}
