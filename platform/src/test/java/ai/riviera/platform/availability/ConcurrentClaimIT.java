package ai.riviera.platform.availability;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.ClaimOutcome;
import ai.riviera.platform.venue.api.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The headline U2 test (issue #5, AC-6): proves invariant #2 holds under real concurrency.
 * Two threads fire {@code claim} for the same {@code (set, date)} simultaneously (released
 * together by a {@link CountDownLatch}); exactly one must win {@code CLAIMED}, the other
 * {@code ALREADY_TAKEN}, and exactly one row may exist. Runs against a real Postgres
 * (Testcontainers) because the guarantee is the atomic {@code INSERT ... ON CONFLICT}
 * against a {@code UNIQUE} index — an in-memory fake could not prove it. A non-atomic
 * implementation would either let both win or throw on the loser; this test catches both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConcurrentClaimIT {

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	JdbcClient jdbc;

	@Test
	void exactlyOneOfTwoConcurrentClaimsWins() throws Exception {
		SetId set = new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
		LocalDate date = LocalDate.of(2026, 8, 1);

		CountDownLatch startGate = new CountDownLatch(1);
		Callable<ClaimOutcome> attempt = () -> {
			startGate.await();
			return claim.claim(set, date);
		};

		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<ClaimOutcome> a = pool.submit(attempt);
			Future<ClaimOutcome> b = pool.submit(attempt);
			startGate.countDown(); // release both as close to simultaneously as possible

			// Bounded waits: a deadlock or lock-wait hang fails the test fast rather than
			// blocking until the CI job times out.
			List<ClaimOutcome> outcomes = List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));

			assertEquals(1, outcomes.stream().filter(o -> o == ClaimOutcome.CLAIMED).count(),
					() -> "exactly one claim must win, got " + outcomes);
			assertEquals(1, outcomes.stream().filter(o -> o == ClaimOutcome.ALREADY_TAKEN).count(),
					() -> "the other claim must be rejected, got " + outcomes);
		}
		finally {
			pool.shutdownNow();
		}

		long rows = jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date)
				.query(Long.class).single();
		assertEquals(1L, rows, "exactly one row may exist for the contested (set, date)");
	}
}
