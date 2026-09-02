package ai.riviera.platform.review;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.api.ReviewTombstones;
import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.application.ModeratedReview;
import ai.riviera.platform.review.application.ReviewModeration;
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The review tombstone against real Postgres: {@link ReviewTombstones} blanks the display name and
 * deletes the comment of every review of the bookings it is handed — hidden rows included — and
 * nothing else moves: the star stays, so the aggregate {@link VenueRatingSummary} answers and the
 * venue's stored rating are unchanged and no {@link ReviewsChanged} is announced; the row leaves the
 * public {@link ListedReviews} page (it no longer carries a comment) and still reads coherently on the
 * admin's list and the author's own panel. A second tombstone of the same bookings changes nothing.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReviewTombstoneFlowIT {

	private static final Instant CHECKED_IN = Instant.parse("2026-07-01T16:00:00Z");
	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	ReviewTombstones tombstones;

	@Autowired
	ListedReviews listed;

	@Autowired
	VenueRatingSummary summary;

	@Autowired
	ReviewModeration moderation;

	@Autowired
	ReviewEligibility eligibility;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	JdbcClient jdbc;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@Test
	void tombstoneBlanksNameAndCommentOnceAndKeepsTheStars() {
		long venueId = fixtures.venue("Tombstone Rows");
		String named = fixtures.completedBooking(venueId, CHECKED_IN);
		String starOnly = fixtures.completedBooking(venueId, CHECKED_IN);
		String hidden = fixtures.completedBooking(venueId, CHECKED_IN);
		fixtures.review(named, 5, "Lovely", "Ana");
		fixtures.review(starOnly, 4, null, "Ben");
		fixtures.hide(fixtures.review(hidden, 1, "Spam", "Cat"));
		List<BookingRef> bookings = List.of(bookingRef(named), bookingRef(starOnly), bookingRef(hidden));

		assertEquals(3, tombstones.tombstone(bookings));

		assertThat(row(named)).containsExactly(5, null, null, false);
		assertThat(row(starOnly)).containsExactly(4, null, null, false);
		assertThat(row(hidden)).containsExactly(1, null, null, true);
		assertEquals(0, tombstones.tombstone(bookings), "a second tombstone of the same rows changes nothing");
	}

	@Test
	void aTombstonedReviewLeavesTheListAndStaysInTheScore() {
		long venueId = fixtures.venue("Tombstone Surfaces");
		VenueRef venue = new VenueRef(venueId);
		String first = fixtures.completedBooking(venueId, Instant.now().minus(Duration.ofHours(1)));
		String second = fixtures.completedBooking(venueId, CHECKED_IN);
		fixtures.review(first, 4, "Good", "Ana");
		fixtures.review(second, 5, "Great", "Ben");
		assertEquals(new RatingSummary(45, 2), summary.summaryFor(venue));

		tombstones.tombstone(List.of(bookingRef(first), bookingRef(second)));

		assertEquals(new RatingSummary(45, 2), summary.summaryFor(venue));
		assertThat(listed.pageFor(venue, ReviewCursor.FIRST_PAGE).reviews()).isEmpty();
		List<ModeratedReview> rows = moderation.pageFor(venue, ReviewCursor.FIRST_PAGE).reviews();
		assertThat(rows).hasSize(2).allSatisfy(r -> {
			assertThat(r.displayName()).isNull();
			assertThat(r.comment()).isNull();
			assertThat(r.hiddenAt()).isNull();
		});
		assertThat(eligibility.panelFor(first)) // checked in an hour ago, so the window is still open
				.isInstanceOfSatisfying(ReviewPanel.AlreadyReviewed.class,
						panel -> assertEquals(new OwnReview(4, null, null), panel.review()));
	}

	@Test
	void tombstoningPublishesNothingAndLeavesTheStoredRating() {
		long venueId = fixtures.venue("Tombstone Stored Rating");
		String code = fixtures.completedBooking(venueId, CHECKED_IN);
		fixtures.review(code, 3, "Fine", "Ana");
		announce(venueId);
		awaitStoredRating(venueId, 30, 1);
		long announced = reviewsChangedPublications();

		tombstones.tombstone(List.of(bookingRef(code)));

		assertThat(storedRating(venueId)).containsExactly(30, 1);
		assertEquals(announced, reviewsChangedPublications(), "a tombstone announces no ReviewsChanged");
	}

	private BookingRef bookingRef(String code) {
		return new BookingRef(fixtures.bookingIdOf(code));
	}

	/** {@code stars, comment, display_name, hidden} of the review behind {@code code}. */
	private List<Object> row(String code) {
		return jdbc.sql("SELECT stars, comment, display_name, hidden_at FROM review WHERE booking_id = :id")
				.param("id", fixtures.bookingIdOf(code))
				.query((rs, n) -> {
					List<Object> values = new ArrayList<>();
					values.add(rs.getInt("stars"));
					values.add(rs.getString("comment"));
					values.add(rs.getString("display_name"));
					values.add(rs.getTimestamp("hidden_at") != null);
					return values;
				})
				.single();
	}

	private void announce(long venueId) {
		new TransactionTemplate(txManager).executeWithoutResult(
				status -> publisher.publishEvent(new ReviewsChanged(new VenueRef(venueId))));
	}

	private void awaitStoredRating(long venueId, int ratingTenths, int reviewsCount) {
		Awaitility.await().atMost(WAIT).untilAsserted(
				() -> assertThat(storedRating(venueId)).containsExactly(ratingTenths, reviewsCount));
	}

	private int[] storedRating(long venueId) {
		return jdbc.sql("SELECT rating_tenths, reviews_count FROM venue WHERE id = :id")
				.param("id", venueId)
				.query((rs, n) -> new int[] {rs.getInt(1), rs.getInt(2)}).single();
	}

	/** Every {@code ReviewsChanged} the registry has ever recorded, in flight or archived. */
	private long reviewsChangedPublications() {
		return jdbc.sql("SELECT count(*) FROM event_publication WHERE event_type LIKE '%ReviewsChanged'")
				.query(Long.class).single()
				+ jdbc.sql("SELECT count(*) FROM event_publication_archive WHERE event_type LIKE '%ReviewsChanged'")
						.query(Long.class).single();
	}
}
