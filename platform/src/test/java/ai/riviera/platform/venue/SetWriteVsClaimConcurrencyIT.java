package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The per-set layout write racing the online claim (AC-6/AC-7). Both sides lock the one
 * {@code set_position} row — the write with {@code FOR UPDATE}, the claim's pool read with
 * {@code FOR KEY SHARE} — so whichever commits first forces a correct answer out of the other,
 * and neither interleaving can leave a {@code BOOKED_ONLINE} row on a {@code WALK_IN} set
 * (invariant #3) or a hold CASCADE-swept by a delete (invariant #2). Without the locks the
 * loser's stale read wins: the claim checks {@code pool = ONLINE}, the edit flips it, and the
 * insert lands anyway. Repeated to exercise both interleavings against a real Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetWriteVsClaimConcurrencyIT {

	/**
	 * Relative to today, never absolute: the edit guard only counts holds from today onwards, so a
	 * fixed date would stop the hold registering the moment real time passed it — and the test would
	 * then let both sides win rather than failing loudly.
	 */
	private static final LocalDate DAY = LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(30);
	/**
	 * A head start long enough for one side to take its row lock before the other starts. Half the
	 * repetitions give it to the claim and half to the layout write, so BOTH branches are exercised
	 * every run — a race left to the scheduler can pass six times having only ever taken one, and the
	 * branch it skips is the one that proves {@code poolForClaim}'s lock.
	 */
	private static final long HEAD_START_MS = 150;

	private static final Set<String> POOL_FLIP_BRANCHES = ConcurrentHashMap.newKeySet();
	private static final Set<String> REMOVE_BRANCHES = ConcurrentHashMap.newKeySet();

	/**
	 * Asserted at each method's own last repetition rather than in an {@code @AfterAll} over both:
	 * a scoped single-method run (the discipline this repo prescribes) would otherwise fail on the
	 * method it never ran, reporting a regression that does not exist.
	 */
	private static void assertBothOrdersExercised(RepetitionInfo info, Set<String> branches,
			String what) {
		if (info.getCurrentRepetition() == info.getTotalRepetitions()) {
			assertEquals(Set.of("claim", "write"), branches,
					what + " never took both orders, so one guard went unproven");
		}
	}

	/**
	 * Repetitions 1–2 race with no head start (the genuine simultaneous case); 3 and 5 let the
	 * claim reach its lock first; 4 and 6 let the layout write. The forced pairs are what make
	 * {@link #bothInterleavingsWereExercised} deterministic instead of scheduler-dependent.
	 */
	private static Ordering orderingFor(int rep) {
		if (rep <= 2) {
			return Ordering.SIMULTANEOUS;
		}
		return rep % 2 == 1 ? Ordering.CLAIM_FIRST : Ordering.WRITE_FIRST;
	}

	private enum Ordering { SIMULTANEOUS, CLAIM_FIRST, WRITE_FIRST }

	/** Releases on the gate, then yields for {@code HEAD_START_MS} when the other side goes first. */
	private static void start(CountDownLatch gate, Ordering ordering, Ordering goesFirst)
			throws InterruptedException {
		gate.await();
		if (ordering != Ordering.SIMULTANEOUS && ordering != goesFirst) {
			Thread.sleep(HEAD_START_MS);
		}
	}

	/**
	 * Runs the two sides concurrently and returns their outcomes. {@code shutdownNow} in a finally
	 * rather than try-with-resources: {@code ExecutorService.close()} waits for termination without
	 * interrupting, so a future lock-order regression would hang the job with no failure message
	 * instead of failing on the 20-second {@code get}.
	 */
	private static <A, B> Outcomes<A, B> race(Callable<A> first, Callable<B> second,
			CountDownLatch gate) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			Future<A> firstF = pool.submit(first);
			Future<B> secondF = pool.submit(second);
			gate.countDown();
			return new Outcomes<>(firstF.get(20, TimeUnit.SECONDS), secondF.get(20, TimeUnit.SECONDS));
		} finally {
			pool.shutdownNow();
		}
	}

	private record Outcomes<A, B>(A claim, B write) {
	}

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(6)
	void claimAndPoolFlipCannotBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		long venueId = insertVenue("Pool Flip Race " + rep);
		long setId = insertOnlineSet(venueId);
		VenueId venue = new VenueId(venueId);
		OperatorId owner = insertOperator("flip-owner-" + rep);
		grant(owner, venueId);

		Ordering ordering = orderingFor(rep);
		CountDownLatch gate = new CountDownLatch(1);
		Outcomes<ClaimOutcome, ChangeOutcome> outcomes = race(
				() -> {
					start(gate, ordering, Ordering.CLAIM_FIRST);
					return availability.claim(new SetId(setId), DAY);
				},
				() -> {
					start(gate, ordering, Ordering.WRITE_FIRST);
					return editBeachMap.editSet(owner, venue, new SetId(setId),
							new SetCommand("A", 1, "PREMIUM", Pool.WALK_IN, 3500, "EUR", 1, 1));
				},
				gate);
		ClaimOutcome claimed = outcomes.claim();
		ChangeOutcome flipped = outcomes.write();

		boolean claimWon = claimed == ClaimOutcome.CLAIMED;
		boolean flipWon = flipped instanceof ChangeOutcome.Applied;
		assertTrue(claimWon != flipWon,
				() -> "exactly one of claim/flip may win, got claim=" + claimed + " flip=" + flipped);
		if (claimWon) {
			assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) flipped).reason(),
					"the claim committed first, so the flip must see the hold");
			assertEquals("ONLINE", poolOf(setId));
		} else {
			assertEquals(ClaimOutcome.NOT_ONLINE_POOL, claimed,
					"the flip committed first, so the claim must re-read the new pool");
			assertEquals("WALK_IN", poolOf(setId));
		}
		assertEquals(claimWon ? 1 : 0, holdsOn(setId),
				"a BOOKED_ONLINE row on a WALK_IN set would break invariant #3");
		POOL_FLIP_BRANCHES.add(claimWon ? "claim" : "write");
	}

	@RepeatedTest(6)
	void claimAndRemoveCannotBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		long venueId = insertVenue("Remove Race " + rep);
		long setId = insertOnlineSet(venueId);
		VenueId venue = new VenueId(venueId);
		OperatorId owner = insertOperator("remove-owner-" + rep);
		grant(owner, venueId);

		Ordering ordering = orderingFor(rep);
		CountDownLatch gate = new CountDownLatch(1);
		Outcomes<ClaimOutcome, ChangeOutcome> outcomes = race(
				() -> {
					start(gate, ordering, Ordering.CLAIM_FIRST);
					return availability.claim(new SetId(setId), DAY);
				},
				() -> {
					start(gate, ordering, Ordering.WRITE_FIRST);
					return editBeachMap.removeSet(owner, venue, new SetId(setId));
				},
				gate);
		ClaimOutcome claimed = outcomes.claim();
		ChangeOutcome removed = outcomes.write();

		boolean claimWon = claimed == ClaimOutcome.CLAIMED;
		boolean removeWon = removed instanceof ChangeOutcome.Applied;
		assertTrue(claimWon != removeWon,
				() -> "exactly one of claim/remove may win, got claim=" + claimed
						+ " remove=" + removed);
		if (claimWon) {
			assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) removed).reason(),
					"the claim committed first, so the delete must be refused");
			assertEquals(1, setRowsFor(setId), "the set must survive so its hold is not cascaded");
			assertEquals(1, holdsOn(setId));
		} else {
			assertEquals(ClaimOutcome.NO_SUCH_SET, claimed,
					"the delete committed first, so the claim must find no set — never an FK error");
			assertEquals(0, setRowsFor(setId));
		}
		REMOVE_BRANCHES.add(claimWon ? "claim" : "write");
	}

	private String poolOf(long setId) {
		return jdbc.sql("SELECT pool FROM set_position WHERE id = :id")
				.param("id", setId).query(String.class).single();
	}

	private int setRowsFor(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_position WHERE id = :id")
				.param("id", setId).query(Integer.class).single();
	}

	private int holdsOn(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :id")
				.param("id", setId).query(Integer.class).single();
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertOnlineSet(long venueId) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1)
				RETURNING id
				""").param("v", venueId).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		long id = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}
}
