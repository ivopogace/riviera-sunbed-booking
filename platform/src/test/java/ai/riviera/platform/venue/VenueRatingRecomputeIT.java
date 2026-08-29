package ai.riviera.platform.venue;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

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
import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-5 through the real delivery path: a {@link ReviewsChanged} recomputes the venue's own
 * {@code rating_tenths}/{@code reviews_count} from the whole review set, and re-delivering the same
 * event changes nothing. The recompute is a full re-read rather than an increment precisely so that
 * the registry's at-least-once delivery converges instead of drifting.
 *
 * <p>Events are published inside a transaction so the {@code AFTER_COMMIT} registry-backed listener
 * fires, and the asynchronous result is awaited ({@code PayoutAccrualIT}'s shape). Testcontainers;
 * skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueRatingRecomputeIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@Test
	void recomputesTheVenueRowFromEveryVisibleReview() {
		long venueId = fixtures.venue("Recompute");
		review(venueId, 5);
		review(venueId, 4);

		announce(venueId);

		awaitRating(venueId, 45, 2);
	}

	@Test
	void redeliveryOfTheSameEventChangesNothing() {
		long venueId = fixtures.venue("Recompute Idempotent");
		review(venueId, 5);
		review(venueId, 4);

		announce(venueId);
		awaitRating(venueId, 45, 2);

		announce(venueId);
		awaitRating(venueId, 45, 2);
	}

	@Test
	void aVenueWithNoReviewsRecomputesBackToNew() {
		long venueId = fixtures.venue("Recompute Empty");

		announce(venueId);

		awaitRating(venueId, 0, 0);
	}

	/** Publish inside a transaction, so the registry persists the publication and delivers on commit. */
	private void announce(long venueId) {
		new TransactionTemplate(txManager).executeWithoutResult(
				status -> publisher.publishEvent(new ReviewsChanged(new VenueRef(venueId))));
	}

	private void review(long venueId, int stars) {
		String code = fixtures.completedBooking(venueId, Instant.now().minusSeconds(3600));
		jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stars, created_at)
				VALUES (:booking, :venue, :stars, :createdAt)
				""")
				.param("booking", fixtures.bookingIdOf(code)).param("venue", venueId)
				.param("stars", stars).param("createdAt", Timestamp.from(Instant.now()))
				.update();
	}

	private void awaitRating(long venueId, int ratingTenths, int reviewsCount) {
		Awaitility.await().atMost(WAIT).untilAsserted(() -> {
			int[] row = jdbc.sql("SELECT rating_tenths, reviews_count FROM venue WHERE id = :id")
					.param("id", venueId)
					.query((rs, n) -> new int[] {rs.getInt(1), rs.getInt(2)}).single();
			assertThat(row).containsExactly(ratingTenths, reviewsCount);
		});
	}
}
