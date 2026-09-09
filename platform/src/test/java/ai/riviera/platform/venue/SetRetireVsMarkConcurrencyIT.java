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
import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The retire racing the staff walk-in mark on a set whose only booking is finished. Both sides lock
 * the one {@code set_position} row — the retire with {@code FOR UPDATE}, the mark's claim-time read
 * with {@code FOR KEY SHARE} through the active view — so whichever commits first forces a correct
 * answer out of the other: a mark that lands first is a live hold the retire refuses
 * ({@code SET_IN_USE}), a retire that lands first leaves the mark no active row
 * ({@code NO_SUCH_SET}) and no hold is ever written onto a retired set (invariant #2, ADR-0019).
 * Repeated with forced head starts so both interleavings are exercised every run, as
 * {@link SetWriteVsClaimConcurrencyIT} does.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetRetireVsMarkConcurrencyIT {

	private static final LocalDate DAY = LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(30);
	private static final LocalDate LAST_SEASON = LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(300);
	private static final long HEAD_START_MS = 150;
	private static final Set<String> BRANCHES = ConcurrentHashMap.newKeySet();

	private enum Ordering { SIMULTANEOUS, MARK_FIRST, RETIRE_FIRST }

	private static Ordering orderingFor(int rep) {
		if (rep <= 2) {
			return Ordering.SIMULTANEOUS;
		}
		return rep % 2 == 1 ? Ordering.MARK_FIRST : Ordering.RETIRE_FIRST;
	}

	private static void start(CountDownLatch gate, Ordering ordering, Ordering goesFirst)
			throws InterruptedException {
		gate.await();
		if (ordering != Ordering.SIMULTANEOUS && ordering != goesFirst) {
			Thread.sleep(HEAD_START_MS);
		}
	}

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

	private record Outcomes<A, B>(A mark, B retire) {
	}

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	StaffAvailability staff;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(6)
	void aRetireAndAMarkNeverBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		long venueId = insertVenue("Retire Race " + rep);
		long setId = insertSetWithFinishedBooking(venueId, "RETRACE" + rep);
		VenueId venue = new VenueId(venueId);
		OperatorId owner = insertOperator("retire-owner-" + rep);
		grant(owner, venueId);

		Ordering ordering = orderingFor(rep);
		CountDownLatch gate = new CountDownLatch(1);
		Outcomes<MarkOutcome, ChangeOutcome> outcomes = race(
				() -> {
					start(gate, ordering, Ordering.MARK_FIRST);
					return staff.mark(owner, new SetId(setId), DAY);
				},
				() -> {
					start(gate, ordering, Ordering.RETIRE_FIRST);
					return editBeachMap.removeSet(owner, venue, new SetId(setId));
				},
				gate);
		MarkOutcome marked = outcomes.mark();
		ChangeOutcome retired = outcomes.retire();

		boolean markWon = marked == MarkOutcome.MARKED;
		boolean retireWon = retired instanceof ChangeOutcome.Applied;
		assertTrue(markWon != retireWon,
				() -> "exactly one of mark/retire may win, got mark=" + marked + " retire=" + retired);
		if (markWon) {
			assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) retired).reason(),
					"the mark committed first, so the retire must be refused");
			assertEquals(1, holdsOn(setId));
		} else {
			assertEquals(MarkOutcome.NO_SUCH_SET, marked,
					"the retire committed first, so the mark must find no active set");
			assertTrue(isRetired(setId));
			assertEquals(0, holdsOn(setId), "a hold must never land on a retired set");
		}
		BRANCHES.add(markWon ? "mark" : "retire");
		if (info.getCurrentRepetition() == info.getTotalRepetitions()) {
			assertEquals(Set.of("mark", "retire"), BRANCHES,
					"the retire race never took both orders, so one guard went unproven");
		}
	}

	private boolean isRetired(long setId) {
		return jdbc.sql("SELECT retired_at IS NOT NULL FROM set_position WHERE id = :id")
				.param("id", setId).query(Boolean.class).single();
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

	/** A set carrying one finished booking, so the remove takes the retire branch, not the delete. */
	private long insertSetWithFinishedBooking(long venueId, String code) {
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1)
				RETURNING id
				""").param("v", venueId).query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600') RETURNING id")
				.param("email", code.toLowerCase() + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :day, 3500, 'EUR', 'COMPLETED')
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("day", LAST_SEASON).update();
		return setId;
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
}
