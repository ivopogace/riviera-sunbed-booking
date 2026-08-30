package ai.riviera.platform.venue;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
import ai.riviera.platform.venue.application.RecomputeVenueRating;
import ai.riviera.platform.venue.vocabulary.VenueId;

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

	@Autowired
	RecomputeVenueRating ratings;

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
	void aRecomputeWaitsForAConcurrentWriterAndThenReadsTheWholeReviewSet() throws Exception {
		long venueId = fixtures.venue("Recompute Race");
		review(venueId, 5);

		// A competing transaction holds the venue row while adding the second review.
		CountDownLatch holdsLock = new CountDownLatch(1);
		CountDownLatch mayCommit = new CountDownLatch(1);
		ExecutorService pool = Executors.newSingleThreadExecutor();
		try {
			Future<?> competitor = pool.submit(() -> new TransactionTemplate(txManager).executeWithoutResult(status -> {
				jdbc.sql("SELECT id FROM venue WHERE id = :id FOR NO KEY UPDATE")
						.param("id", venueId).query(Long.class).single();
				review(venueId, 4);
				holdsLock.countDown();
				awaitQuietly(mayCommit);
			}));

			assertThat(holdsLock.await(WAIT.toSeconds(), TimeUnit.SECONDS)).isTrue();
			// Release the competitor only once the recompute is provably parked on the venue row.
			awaitBlockedOnALock(mayCommit);
			ratings.recompute(new VenueId(venueId));
			competitor.get(WAIT.toSeconds(), TimeUnit.SECONDS);
		}
		finally {
			mayCommit.countDown(); // never leave the competitor holding the row if an assertion threw
			pool.shutdownNow();
		}

		awaitRating(venueId, 45, 2);
	}

	/** Release {@code gate} as soon as some session is waiting on a lock — the recompute, parked. */
	private void awaitBlockedOnALock(CountDownLatch gate) {
		Executors.newSingleThreadExecutor().submit(() -> {
			Awaitility.await().atMost(WAIT).until(() -> Boolean.TRUE.equals(jdbc.sql(
					"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock')")
					.query(Boolean.class).single()));
			gate.countDown();
		});
	}

	private static void awaitQuietly(CountDownLatch gate) {
		try {
			gate.await(WAIT.toSeconds(), TimeUnit.SECONDS);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
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
