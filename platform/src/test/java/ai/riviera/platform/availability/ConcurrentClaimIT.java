package ai.riviera.platform.availability;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
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
 * The headline U2 tests (issue #5, AC-6): prove invariant #2 holds under real concurrency.
 * Several callers fire {@code claim} for the same {@code (set, date)} simultaneously (released
 * together by a {@link CountDownLatch}); exactly one must win {@code CLAIMED}, the rest
 * {@code ALREADY_TAKEN}, and exactly one row may exist. Run against a real Postgres
 * (Testcontainers) because the guarantee is the atomic {@code INSERT ... ON CONFLICT} against
 * a {@code UNIQUE} index — an in-memory fake could not prove it. A non-atomic implementation
 * would either let two win or throw on a loser; these tests catch both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConcurrentClaimIT {

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	JdbcClient jdbc;

	private SetId anyOnlineSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private long rowCount(SetId set, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date)
				.query(Long.class).single();
	}

	/**
	 * Fire {@code contenders} claims for one {@code (set, date)}, released together, and return
	 * the outcomes. Bounded waits so a deadlock / lock-wait hang fails the test fast rather than
	 * blocking until the CI job times out.
	 */
	private List<ClaimOutcome> raceClaims(SetId set, LocalDate date, int contenders) throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		Callable<ClaimOutcome> attempt = () -> {
			startGate.await();
			return claim.claim(set, date);
		};
		ExecutorService pool = Executors.newFixedThreadPool(contenders);
		try {
			List<Future<ClaimOutcome>> futures = new ArrayList<>();
			for (int i = 0; i < contenders; i++) {
				futures.add(pool.submit(attempt));
			}
			startGate.countDown(); // release all as close to simultaneously as possible
			List<ClaimOutcome> outcomes = new ArrayList<>();
			for (Future<ClaimOutcome> f : futures) {
				outcomes.add(f.get(15, TimeUnit.SECONDS));
			}
			return outcomes;
		}
		finally {
			pool.shutdownNow();
		}
	}

	private static long count(List<ClaimOutcome> outcomes, ClaimOutcome want) {
		return outcomes.stream().filter(o -> o == want).count();
	}

	@Test
	void exactlyOneOfTwoConcurrentClaimsWins() throws Exception {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2026, 8, 1);

		List<ClaimOutcome> outcomes = raceClaims(set, date, 2);

		assertEquals(1, count(outcomes, ClaimOutcome.CLAIMED),
				() -> "exactly one claim must win, got " + outcomes);
		assertEquals(1, count(outcomes, ClaimOutcome.ALREADY_TAKEN),
				() -> "the other claim must be rejected, got " + outcomes);
		assertEquals(1L, rowCount(set, date), "exactly one row may exist for the contested (set, date)");
	}

	/**
	 * Stress the guard well past two contenders, repeated several times. A single 2-thread pass
	 * can win on lucky scheduling; for the #1 correctness invariant we want many claimers racing
	 * over the SAME row across repeated runs. Each repetition uses a distinct date (the
	 * Testcontainers DB is shared across methods/repetitions) so repetitions don't interfere.
	 */
	@RepeatedTest(5)
	void manyConcurrentClaimsYieldExactlyOneWinner(RepetitionInfo info) throws Exception {
		int contenders = 16;
		SetId set = anyOnlineSet();
		// Distinct per repetition: 2026-08-10, -11, ... — independent of the 2-thread test's date.
		LocalDate date = LocalDate.of(2026, 8, 10).plusDays(info.getCurrentRepetition());

		List<ClaimOutcome> outcomes = raceClaims(set, date, contenders);

		assertEquals(1, count(outcomes, ClaimOutcome.CLAIMED),
				() -> "exactly one of " + contenders + " concurrent claims may win, got " + outcomes);
		assertEquals(contenders - 1, count(outcomes, ClaimOutcome.ALREADY_TAKEN),
				() -> "every other claim must be ALREADY_TAKEN (never an exception or a second win), got " + outcomes);
		assertEquals(1L, rowCount(set, date), "exactly one row may exist for the contested (set, date)");
	}
}
