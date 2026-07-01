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
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The headline U8 test (issue #10, AC-1): prove invariant #2 holds across the TWO channels. A staff
 * tap-to-mark and an online claim race for the <strong>same</strong> {@code (set, date)}, released
 * together by a {@link CountDownLatch}; exactly one must win and exactly one row may exist — never
 * both a {@code MARKED} and a {@code CLAIMED}. Both writers use the same atomic
 * {@code INSERT ... ON CONFLICT} against the {@code UNIQUE(set_id, booking_date)} index, so the DB
 * arbitrates regardless of which channel is which. Run against real Postgres (Testcontainers); an
 * in-memory fake could not prove the atomicity. A non-atomic second writer would let both win or
 * throw on the loser — this test catches both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StaffMarkVsOnlineClaimConcurrencyIT {

	@Autowired
	StaffAvailability staff;

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	OperatorDirectory operators;

	private SetId anyOnlineSet() {
		// An ONLINE-pool set so the online claim is even possible (a WALK_IN set would 422 before the
		// race). Staff marking is pool-agnostic, so it contends on this same set.
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private long rowCount(SetId set, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date)
				.query(Long.class).single();
	}

	/**
	 * Race one staff mark against one online claim for the same {@code (set, date)}, released
	 * together. Returns {@code [markWon, claimWon]}. Bounded waits so a lock-wait hang fails fast.
	 */
	private boolean[] race(SetId set, LocalDate date) throws Exception {
		// Resolve the owns-all bootstrap operator once, outside the race (#73): the ownership guard is
		// not what's under test here — the atomic INSERT ... ON CONFLICT is.
		OperatorId operator = operators.operatorFor("operator").orElseThrow();
		CountDownLatch startGate = new CountDownLatch(1);
		Callable<Boolean> markAttempt = () -> {
			startGate.await();
			return staff.mark(operator, set, date) == MarkOutcome.MARKED;
		};
		Callable<Boolean> claimAttempt = () -> {
			startGate.await();
			return claim.claim(set, date) == ClaimOutcome.CLAIMED;
		};
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<Boolean> mark = pool.submit(markAttempt);
			Future<Boolean> claimed = pool.submit(claimAttempt);
			startGate.countDown(); // release both as close to simultaneously as possible
			return new boolean[] { mark.get(15, TimeUnit.SECONDS), claimed.get(15, TimeUnit.SECONDS) };
		}
	}

	@Test
	void staffMarkAndOnlineClaimCannotBothWin() throws Exception {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2031, 8, 1);

		boolean[] won = race(set, date);

		assertTrue(won[0] ^ won[1],
				() -> "exactly one channel must win, got mark=" + won[0] + " claim=" + won[1]);
		assertEquals(1L, rowCount(set, date), "exactly one row may exist for the contested (set, date)");
	}

	/**
	 * Repeat the cross-channel race several times over distinct dates. A single pass can win on lucky
	 * scheduling; for the #1 correctness invariant we want the staff/online contention exercised
	 * repeatedly. Each repetition uses its own date (the Testcontainers DB is shared).
	 */
	@RepeatedTest(5)
	void crossChannelRaceAlwaysYieldsExactlyOneWinner(RepetitionInfo info) throws Exception {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2031, 8, 10).plusDays(info.getCurrentRepetition());

		List<Boolean> winners = new ArrayList<>();
		boolean[] won = race(set, date);
		if (won[0]) {
			winners.add(Boolean.TRUE);
		}
		if (won[1]) {
			winners.add(Boolean.TRUE);
		}

		assertEquals(1, winners.size(),
				() -> "exactly one channel may win, got mark=" + won[0] + " claim=" + won[1]);
		assertEquals(1L, rowCount(set, date), "exactly one row may exist for the contested (set, date)");
	}
}
