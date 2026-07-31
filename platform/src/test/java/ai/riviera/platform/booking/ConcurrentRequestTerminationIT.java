package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.ExpireRequests;
import ai.riviera.platform.booking.application.request.WithdrawOutcome;
import ai.riviera.platform.booking.application.request.WithdrawRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The guest withdraw (issue #123) at the SQL seam against real Postgres — the properties a mocked
 * {@code Bookings} cannot prove.
 *
 * <p><strong>The race (AC-4).</strong> Withdraw and the expiry sweep are the one pair of terminal
 * legs whose guards are NOT disjoint by predicate: withdraw is deliberately undeadlined, so on an
 * overdue row both {@code WHERE} clauses match. What separates them is the row lock — whichever
 * {@code UPDATE} reaches the row first commits, and the other re-evaluates its guard against the new
 * status, matches 0 rows, and releases nothing. Exactly one terminal state, exactly one release
 * (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
// Push the background RequestSweepScheduler far out: this IT seeds OVERDUE pending requests and
// races them deliberately, so a scheduler tick from the cached test context could terminate a
// fixture before the code under test does and flake the assertions (the #98 lesson).
@SpringBootTest(properties = "booking.request.initial-delay=PT2H")
class ConcurrentRequestTerminationIT {

	@Autowired
	WithdrawRequest withdrawRequest;

	@Autowired
	ExpireRequests expireRequests;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private long setId;

	@BeforeEach
	void seedRequestVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Withdraw Club', 'Withdraw Beach', 'Withdraw Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	/** A PENDING_REQUEST row with its (set, date) soft-held; overdue when {@code expiresAt} is past. */
	private long insertRequest(String code, LocalDate date, Instant expiresAt) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("expires", java.sql.Timestamp.from(expiresAt))
				.query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE') ON CONFLICT DO NOTHING")
				.param("set", setId).param("date", date).update();
		return booking;
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private long heldRows(LocalDate date) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :date")
				.param("set", setId).param("date", date).query(Long.class).single();
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	@RepeatedTest(3)
	void withdrawAndExpiryReleaseExactlyOnce() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(3);
		String code = uniqueCode("WDRACE");
		long bookingId = insertRequest(code, date, Instant.now().minusSeconds(30));

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Integer> sweep = () -> {
			gate.await();
			return expireRequests.sweep();
		};
		Callable<WithdrawOutcome> withdraw = () -> {
			gate.await();
			return withdrawRequest.withdraw(code);
		};

		int swept;
		WithdrawOutcome outcome;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			List<Future<?>> futures = new ArrayList<>();
			futures.add(pool.submit(sweep));
			futures.add(pool.submit(withdraw));
			gate.countDown();
			swept = (Integer) futures.get(0).get();
			outcome = (WithdrawOutcome) futures.get(1).get();
		}

		boolean withdrawWon = outcome instanceof WithdrawOutcome.Withdrawn;
		assertTrue(withdrawWon ^ swept >= 1,
				"exactly one terminal leg may transition the row (withdrawWon=%s, swept=%d)"
						.formatted(withdrawWon, swept));
		assertEquals(withdrawWon ? "WITHDRAWN" : "EXPIRED", statusOf(bookingId));
		assertEquals(0L, heldRows(date),
				"the soft-hold is released exactly once, whichever leg won (invariant #2)");
	}

	@Test
	void withdrawsAnOverdueButUnsweptRequest() {
		LocalDate date = LocalDate.now().plusMonths(3);
		String code = uniqueCode("WDLATE");
		long bookingId = insertRequest(code, date, Instant.now().minusSeconds(30));

		// Not deadline-guarded, matching decline: the guest may still retract a request the sweep has
		// not reached yet. Same release, different terminal label.
		assertInstanceOf(WithdrawOutcome.Withdrawn.class, withdrawRequest.withdraw(code));
		assertEquals("WITHDRAWN", statusOf(bookingId));
		assertEquals(0L, heldRows(date));
	}

	@Test
	void withdrawnSetIsImmediatelyRebookable() {
		LocalDate date = LocalDate.now().plusMonths(3);
		String code = uniqueCode("WDFREE");
		insertRequest(code, date, Instant.now().plusSeconds(3600));

		assertInstanceOf(WithdrawOutcome.Withdrawn.class, withdrawRequest.withdraw(code));

		// The whole point of the slice: the (set, date) is free for the next buyer at once, rather
		// than staying held until the venue answers or the deadline passes.
		assertEquals(0L, heldRows(date));
		assertEquals(1, jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE') ON CONFLICT DO NOTHING")
				.param("set", setId).param("date", date).update(),
				"a fresh claim on the released (set, date) succeeds");
	}

	@Test
	void withdrawIsRejectedOnceTheVenueHasAccepted() {
		LocalDate date = LocalDate.now().plusMonths(3);
		String code = uniqueCode("WDACC");
		long bookingId = insertRequest(code, date, Instant.now().plusSeconds(3600));
		jdbc.sql("UPDATE booking SET status = 'AWAITING_PAYMENT', accepted_at = now() WHERE id = :id")
				.param("id", bookingId).update();

		assertEquals(WithdrawOutcome.Rejected.NOT_PENDING, withdrawRequest.withdraw(code));
		assertEquals("AWAITING_PAYMENT", statusOf(bookingId));
		assertEquals(1L, heldRows(date), "a rejected withdraw releases nothing");
	}
}
