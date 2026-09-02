package ai.riviera.platform.review;

import java.time.Instant;
import java.time.YearMonth;
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
import ai.riviera.platform.review.application.ModeratedReview;
import ai.riviera.platform.review.application.ReviewModeration;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Moderation against real Postgres: a hidden review counts for nothing on either public surface —
 * the aggregate {@link VenueRatingSummary} answers and the page {@link ListedReviews} serves — and
 * un-hiding through {@link ReviewModeration} puts it back on both, while the admin's own list keeps
 * showing every row, marked. The predicate lives in the adapter's two public reads, so this is the
 * test that proves both carry it and the conditional updates answer with the row they flipped.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReviewModerationFlowIT {

	private static final Instant CHECKED_IN = Instant.parse("2026-07-01T16:00:00Z");

	@Autowired
	ListedReviews listed;

	@Autowired
	VenueRatingSummary summary;

	@Autowired
	ReviewModeration moderation;

	@Autowired
	JdbcClient jdbc;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@Test
	void hiddenReviewsLeaveTheAggregate() {
		long venueId = fixtures.venue("Moderation Aggregate");
		review(venueId, 4, "Good");
		review(venueId, 5, "Great");
		long spam = review(venueId, 1, "Rubbish");

		fixtures.hide(spam);

		assertEquals(new RatingSummary(45, 2), summary.summaryFor(new VenueRef(venueId)));
	}

	@Test
	void hiddenReviewsLeaveTheList() {
		long venueId = fixtures.venue("Moderation List");
		long kept = review(venueId, 4, "Kept");
		long taken = review(venueId, 2, "Taken down");

		fixtures.hide(taken);

		assertThat(idsOf(listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE)))
				.containsExactly(kept);
	}

	@Test
	void unhideRestoresBothSurfaces() {
		long venueId = fixtures.venue("Moderation Unhide");
		long id = review(venueId, 3, "Fine");
		VenueRef venue = new VenueRef(venueId);

		assertEquals(new ModerationOutcome.Applied(), moderation.hide(new ReviewRef(id)));
		assertEquals(new RatingSummary(0, 0), summary.summaryFor(venue));
		assertThat(idsOf(listed.pageFor(venue, ReviewCursor.FIRST_PAGE))).isEmpty();

		assertEquals(new ModerationOutcome.Applied(), moderation.unhide(new ReviewRef(id)));
		assertEquals(new ModerationOutcome.AlreadyApplied(), moderation.unhide(new ReviewRef(id)));

		assertEquals(new RatingSummary(30, 1), summary.summaryFor(venue));
		assertThat(idsOf(listed.pageFor(venue, ReviewCursor.FIRST_PAGE))).containsExactly(id);
	}

	@Test
	void adminListShowsEveryReviewMarked() {
		long venueId = fixtures.venue("Moderation Admin List");
		long commented = review(venueId, 5, "Lovely");
		long starOnly = fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), 4, null, null);
		long hidden = review(venueId, 1, "Spam");
		moderation.hide(new ReviewRef(hidden));

		List<ModeratedReview> rows =
				moderation.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE).reviews();

		assertThat(rows).extracting(r -> r.ref().value()).containsExactly(hidden, starOnly, commented);
		assertThat(rows.get(0).hiddenAt()).isNotNull();
		assertThat(rows.get(0).comment()).isEqualTo("Spam");
		assertThat(rows.get(1).hiddenAt()).isNull();
		assertThat(rows.get(1).comment()).isNull();
		assertThat(rows.get(2)).satisfies(r -> {
			assertThat(r.hiddenAt()).isNull();
			assertThat(r.displayName()).isEqualTo("Guest");
			assertThat(r.stayedIn()).isEqualTo(YearMonth.of(2026, 7));
			assertThat(r.createdAt()).isNotNull();
		});
		assertEquals(new ModerationOutcome.NoSuchReview(), moderation.hide(new ReviewRef(Long.MAX_VALUE)));
	}

	private long review(long venueId, int stars, String comment) {
		return fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), stars, comment, "Guest");
	}

	private static List<Long> idsOf(ReviewPage page) {
		return page.reviews().stream().map(r -> r.ref().value()).toList();
	}
}
