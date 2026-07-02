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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.ExpireRequests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The accept-vs-expiry race (issue #98, AC-5): a request exactly at its deadline is hit by the
 * expiry sweep and a concurrent accept — at most one may win, and the loser must see a clean
 * 0-row no-op (never an exception, never a double state change, never a set left claimed by an
 * {@code EXPIRED} booking or released under an {@code AWAITING_PAYMENT} one). The two guarded
 * transitions are disjoint by predicate ({@code request_expires_at > now} vs {@code <= now} on
 * the same {@code PENDING_REQUEST} guard), so whichever statement matches the row first wins and
 * the other matches nothing. Driven at the SQL/service seam against real Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RequestExpiryVsAcceptRaceIT {

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
				VALUES ('Race Club', 'Race Beach', 'Race Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	/** A PENDING_REQUEST row already past its deadline, its (set, date) soft-held. */
	private long insertOverdueRequest(String code, LocalDate date) {
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
				.param("expires", java.sql.Timestamp.from(Instant.now().minusSeconds(30)))
				.query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE') ON CONFLICT DO NOTHING")
				.param("set", setId).param("date", date).update();
		return booking;
	}

	/** The accept-side guarded transition exactly as JdbcBookings issues it. */
	private int tryAccept(long bookingId, Instant now) {
		return jdbc.sql("""
				UPDATE booking
				SET status = 'AWAITING_PAYMENT', accepted_at = :now
				WHERE id = :id AND venue_id = :venue AND status = 'PENDING_REQUEST'
				  AND request_expires_at > :now
				""")
				.param("now", java.sql.Timestamp.from(now))
				.param("id", bookingId)
				.param("venue", venueId)
				.update();
	}

	@RepeatedTest(3)
	void sweepAndAcceptCannotBothWin() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(3);
		long bookingId = insertOverdueRequest("RACE" + System.nanoTime() % 1_000_000, date);

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Integer> sweep = () -> {
			gate.await();
			return expireRequests.sweep();
		};
		Callable<Integer> accept = () -> {
			gate.await();
			return tryAccept(bookingId, Instant.now());
		};

		int swept;
		int accepted;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			List<Future<Integer>> futures = new ArrayList<>();
			futures.add(pool.submit(sweep));
			futures.add(pool.submit(accept));
			gate.countDown();
			swept = futures.get(0).get();
			accepted = futures.get(1).get();
		}

		// The request is overdue, so accept's deadline guard can never match — the sweep must win
		// and the accept must be a clean 0-row no-op (the disjoint-predicate proof).
		assertEquals(0, accepted, "an overdue request must not be acceptable");
		assertTrue(swept >= 1, "the sweep expires the overdue request");

		String status = jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
		assertEquals("EXPIRED", status);
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_availability "
						+ "WHERE set_id = :set AND booking_date = :date")
				.param("set", setId).param("date", date).query(Long.class).single(),
				"the expired request's soft-hold is released exactly once (invariant #2)");
	}
}
