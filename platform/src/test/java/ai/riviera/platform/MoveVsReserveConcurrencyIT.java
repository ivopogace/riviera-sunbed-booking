package ai.riviera.platform;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
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

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A remodel commit moving a booking racing an online reserve of the very set the preview picked as
 * the candidate (invariant #2). The commit re-derives the classification under {@code FOR UPDATE}
 * on every active set row of the venue; the reserve's pool read takes {@code FOR KEY SHARE} on the
 * candidate's row, so whichever commits first forces a correct answer out of the other: a reserve
 * that lands first is seen and the guest is re-ranked to the next free set, a commit that lands
 * first leaves the reserve {@code ALREADY_TAKEN}. Never both on one {@code (set, date)}, and the
 * preview token never refuses the re-ranked move — it binds outcome kinds, not candidates.
 * Modelled on {@code SetWriteVsClaimConcurrencyIT}: half the repetitions give each side a head
 * start so both orders are exercised every run.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MoveVsReserveConcurrencyIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalDate DAY = LocalDate.now(TIRANE).plusDays(30);
	private static final long HEAD_START_MS = 150;
	private static final Set<String> BRANCHES = ConcurrentHashMap.newKeySet();

	private enum Ordering { SIMULTANEOUS, RESERVE_FIRST, COMMIT_FIRST }

	@Autowired
	RemodelCommitService commits;

	@Autowired
	RemodelClaims claims;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(6)
	void aMoveAndAReserveNeverBothHoldTheCandidate(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue("Move Race Club " + rep));
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long a3 = insertSet(venue, 3);
		OperatorId owner = insertOperator("move-race-owner-" + rep);
		grant(owner, venue.value());
		long booking = seedConfirmedBooking(venue, a1, DAY);
		PreviewToken token = PreviewToken.of(claims.classify(owner, venue, List.of(new SetId(a1))));
		List<LayoutCell> keepingA2AndA3 = List.of(cell(2), cell(3));

		Ordering ordering = orderingFor(rep);
		CountDownLatch gate = new CountDownLatch(1);
		Callable<ClaimOutcome> reserve = () -> {
			start(gate, ordering, Ordering.RESERVE_FIRST);
			return availability.claim(new SetId(a2), DAY);
		};
		Callable<RemodelCommitOutcome> commit = () -> {
			start(gate, ordering, Ordering.COMMIT_FIRST);
			return commits.commit(owner, venue, 0L, keepingA2AndA3, token, RefundConfirmation.NONE);
		};

		ExecutorService pool = Executors.newFixedThreadPool(2);
		ClaimOutcome claimed;
		RemodelCommitOutcome committed;
		try {
			Future<ClaimOutcome> claimF = pool.submit(reserve);
			Future<RemodelCommitOutcome> commitF = pool.submit(commit);
			gate.countDown();
			claimed = claimF.get(20, TimeUnit.SECONDS);
			committed = commitF.get(20, TimeUnit.SECONDS);
		}
		finally {
			pool.shutdownNow();
		}

		assertTrue(committed instanceof RemodelCommitOutcome.Committed,
				() -> "a reserve on the candidate re-ranks the move, never refuses it, got " + committed);
		long seatedOn = setOf(booking);
		assertEquals(1, onlineHolds(a2), "exactly one online claim holds the candidate on that day");
		assertEquals(0, onlineHolds(a1), "the old row is released");
		assertEquals(1, onlineHolds(seatedOn), "the moved booking holds the row of the set it now names");
		assertNotNull(movedAt(booking), "the move is stamped");
		assertTrue(retired(a1), "the set the booking left keeps its history");
		boolean reserveWon = claimed == ClaimOutcome.CLAIMED;
		if (reserveWon) {
			assertEquals(a3, seatedOn, "the reserve took A2 first, so the commit re-ranked the guest to A3");
		}
		else {
			assertEquals(ClaimOutcome.ALREADY_TAKEN, claimed, "the commit seated the guest on A2 first");
			assertEquals(a2, seatedOn);
		}
		BRANCHES.add(reserveWon ? "reserve" : "commit");
		if (rep == info.getTotalRepetitions()) {
			assertEquals(Set.of("reserve", "commit"), BRANCHES,
					"the race never took both orders, so one guard went unproven");
		}
	}

	private static Ordering orderingFor(int rep) {
		if (rep <= 2) {
			return Ordering.SIMULTANEOUS;
		}
		return rep % 2 == 1 ? Ordering.RESERVE_FIRST : Ordering.COMMIT_FIRST;
	}

	private static void start(CountDownLatch gate, Ordering ordering, Ordering goesFirst)
			throws InterruptedException {
		gate.await();
		if (ordering != Ordering.SIMULTANEOUS && ordering != goesFirst) {
			Thread.sleep(HEAD_START_MS);
		}
	}

	private static LayoutCell cell(int position) {
		return new LayoutCell("A", position, "STANDARD", Pool.ONLINE, 2000, "EUR", position, 1);
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertSet(VenueId venue, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2000, 'EUR', :pos, 1)
				RETURNING id
				""").param("v", venue.value()).param("pos", position).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		long id = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	private long seedConfirmedBooking(VenueId venue, long setId, LocalDate date) {
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:e, 'Guest', '+355000') RETURNING id
				""").param("e", "move-race-" + System.nanoTime() + "@example.test").query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, 'BOOKED_ONLINE')")
				.param("s", setId).param("d", date).update();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :v, :s, :c, :date, 2000, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""")
				.param("code", "MR-" + System.nanoTime())
				.param("v", venue.value()).param("s", setId).param("c", customerId).param("date", date)
				.query(Long.class).single();
	}

	private long setOf(long bookingId) {
		return jdbc.sql("SELECT set_id FROM booking WHERE id = :id").param("id", bookingId)
				.query(Long.class).single();
	}

	private Object movedAt(long bookingId) {
		return jdbc.sql("SELECT moved_at FROM booking WHERE id = :id").param("id", bookingId)
				.query(java.sql.Timestamp.class).optional().orElse(null);
	}

	private int onlineHolds(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s AND booking_date = :d AND state = 'BOOKED_ONLINE'")
				.param("s", setId).param("d", DAY).query(Integer.class).single();
	}

	private boolean retired(long setId) {
		return jdbc.sql("SELECT retired_at IS NOT NULL FROM set_position WHERE id = :id").param("id", setId)
				.query(Boolean.class).single();
	}
}
