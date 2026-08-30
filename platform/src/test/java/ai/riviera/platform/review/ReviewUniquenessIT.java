package ai.riviera.platform.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.ReviewFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The headline AC-2 test: at most one review per booking, under real concurrency. Several submits
 * for the same booking fire together (released by a {@link CountDownLatch}); exactly one must answer
 * {@code Submitted}, the rest {@code AlreadyReviewed}, and exactly one row may exist.
 *
 * <p>Run against a real Postgres (Testcontainers) because the guarantee is the atomic
 * {@code INSERT ... ON CONFLICT} against the {@code review_once_per_booking} index — a fake could
 * not prove it. A read-then-write implementation would either record two rows or throw at the loser;
 * both are caught here.
 *
 * <p>The amend race is the same guarantee one verb along: an edit and a delete fired together on
 * one review resolve by row-level semantics, so the loser reads its rows-affected as
 * {@code NoSuchReview} instead of throwing or leaving a second row behind.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReviewUniquenessIT {

	private static final Instant CHECKED_IN = Instant.now().minusSeconds(3600);

	@Autowired
	ReviewLifecycle lifecycle;

	@Autowired
	JdbcClient jdbc;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
	}

	@RepeatedTest(3)
	void concurrentDoubleSubmitRecordsOne() throws Exception {
		String code = fixtures.completedBooking(fixtures.venue("Uniqueness"), CHECKED_IN);

		List<SubmitOutcome> outcomes = raceSubmits(code, 4);

		assertEquals(1, outcomes.stream().filter(SubmitOutcome.Submitted.class::isInstance).count(),
				"exactly one submit may record the review");
		assertEquals(3, outcomes.stream().filter(SubmitOutcome.AlreadyReviewed.class::isInstance).count(),
				"every loser must answer AlreadyReviewed, never throw");
		assertEquals(1, fixtures.reviewCountFor(code), "exactly one row may exist");
	}

	@RepeatedTest(1)
	void aRepeatedSubmitIsAlreadyReviewed() {
		String code = fixtures.completedBooking(fixtures.venue("Repeat"), CHECKED_IN);

		assertEquals(new SubmitOutcome.Submitted(), lifecycle.submit(code, stars(5)));
		assertEquals(new SubmitOutcome.AlreadyReviewed(), lifecycle.submit(code, stars(1)));
		assertEquals(1, fixtures.reviewCountFor(code));
	}

	private static ReviewSubmission stars(int stars) {
		return new ReviewSubmission(stars, null, "Ana");
	}

	@RepeatedTest(3)
	void aDeleteRacingAnEditLeavesAtMostOneRow() throws Exception {
		String code = fixtures.completedBooking(fixtures.venue("Amend Race"), CHECKED_IN);
		assertEquals(new SubmitOutcome.Submitted(), lifecycle.submit(code, stars(4)));

		List<AmendOutcome> outcomes = raceAnEditAgainstADelete(code);

		assertThat(outcomes).allMatch(
				outcome -> outcome instanceof AmendOutcome.Done
						|| outcome instanceof AmendOutcome.NoSuchReview,
				"an amend may only succeed or find no review — never throw");
		assertThat(outcomes).anyMatch(AmendOutcome.Done.class::isInstance);
		assertThat(fixtures.reviewCountFor(code)).isLessThanOrEqualTo(1);
	}

	/** One edit and one delete on the same review, released together. Bounded waits fail fast. */
	private List<AmendOutcome> raceAnEditAgainstADelete(String code) throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		List<Callable<AmendOutcome>> attempts = List.of(
				() -> {
					startGate.await();
					return lifecycle.edit(code, stars(5));
				},
				() -> {
					startGate.await();
					return lifecycle.delete(code);
				});
		try (ExecutorService pool = Executors.newFixedThreadPool(attempts.size())) {
			List<Future<AmendOutcome>> futures = attempts.stream().map(pool::submit).toList();
			startGate.countDown();
			List<AmendOutcome> outcomes = new ArrayList<>();
			for (Future<AmendOutcome> f : futures) {
				outcomes.add(f.get(15, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	/** Fire {@code contenders} submits for one booking, released together. Bounded waits fail fast. */
	private List<SubmitOutcome> raceSubmits(String code, int contenders) throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		Callable<SubmitOutcome> attempt = () -> {
			startGate.await();
			return lifecycle.submit(code, stars(4));
		};
		try (ExecutorService pool = Executors.newFixedThreadPool(contenders)) {
			List<Future<SubmitOutcome>> futures = new ArrayList<>();
			for (int i = 0; i < contenders; i++) {
				futures.add(pool.submit(attempt));
			}
			startGate.countDown();
			List<SubmitOutcome> outcomes = new ArrayList<>();
			for (Future<SubmitOutcome> f : futures) {
				outcomes.add(f.get(15, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}
}
