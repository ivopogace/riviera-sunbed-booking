package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
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
import ai.riviera.platform.booking.application.checkin.MarkNoShows;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The no-show sweep: a {@code CONFIRMED} booking whose service day has passed in
 * {@code Europe/Tirane} becomes {@code NO_SHOW}, because nothing checked it in. Today's and future
 * bookings, and anything already terminal, are untouched.
 *
 * <p>Every test drains first — the sweep is platform-wide, not venue-scoped, so a count assertion
 * is only deterministic once the pre-existing past-day rows other test classes seeded are already
 * swept. After the drain the class seeds its own rows and counts them.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class NoShowSweepIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MarkNoShows markNoShows;

	@Autowired
	JdbcClient jdbc;

	private long venueId;

	@BeforeEach
	void seedVenueAndDrain() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('No-Show Club', 'NS Beach', 'NS Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", venueId).update();
		markNoShows.sweep();
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private long insert(String code, LocalDate date, String status) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status, now())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", set)
				.param("cust", customer).param("date", date).param("status", status)
				.query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	@Test
	void sweepsPastConfirmedBooking() {
		long yesterday = insert(uniqueCode("NSPAST"), today().minusDays(1), "CONFIRMED");
		long lastWeek = insert(uniqueCode("NSOLD"), today().minusDays(7), "CONFIRMED");

		assertEquals(2, markNoShows.sweep());

		assertEquals("NO_SHOW", statusOf(yesterday));
		assertEquals("NO_SHOW", statusOf(lastWeek));
	}

	@Test
	void leavesTodayAndFutureUntouched() {
		long todaysBooking = insert(uniqueCode("NSTODAY"), today(), "CONFIRMED");
		long tomorrow = insert(uniqueCode("NSFUTURE"), today().plusDays(1), "CONFIRMED");

		assertEquals(0, markNoShows.sweep(), "no past-day row exists, so nothing may transition");

		assertEquals("CONFIRMED", statusOf(todaysBooking));
		assertEquals("CONFIRMED", statusOf(tomorrow));
	}

	@Test
	void neverTouchesCheckedInBooking() {
		long completed = insert(uniqueCode("NSDONE"), today().minusDays(1), "CONFIRMED");
		jdbc.sql("UPDATE booking SET status = 'COMPLETED', completed_at = now() WHERE id = :id")
				.param("id", completed).update();

		assertEquals(0, markNoShows.sweep());

		assertEquals("COMPLETED", statusOf(completed),
				"checked-in is the only path to COMPLETED and the sweep must never undo it");
	}

	@Test
	void secondRunIsANoOp() {
		long booking = insert(uniqueCode("NSTWICE"), today().minusDays(1), "CONFIRMED");

		assertEquals(1, markNoShows.sweep());
		assertEquals(0, markNoShows.sweep(), "the status guard makes a repeated sweep a 0-row no-op");

		assertEquals("NO_SHOW", statusOf(booking));
	}

	@Test
	void onlyConfirmedIsSwept() {
		LocalDate past = today().minusDays(2);
		List<String> untouchable = List.of("CANCELLED", "COMPLETED", "DECLINED", "EXPIRED",
				"WITHDRAWN", "AWAITING_PAYMENT", "PENDING_REQUEST", "NO_SHOW");
		List<Long> ids = new ArrayList<>();
		for (String status : untouchable) {
			ids.add(insert(uniqueCode("NS" + status), past, status));
		}

		assertEquals(0, markNoShows.sweep());

		for (int i = 0; i < untouchable.size(); i++) {
			assertEquals(untouchable.get(i), statusOf(ids.get(i)),
					"a booking that already left CONFIRMED is terminal for the sweep");
		}
	}

	@RepeatedTest(3)
	void concurrentSweepsYieldExactlyOneTransition() throws Exception {
		long booking = insert(uniqueCode("NSRACE"), today().minusDays(1), "CONFIRMED");

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Integer> sweep = () -> {
			gate.await();
			return markNoShows.sweep();
		};

		int first;
		int second;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			List<Future<Integer>> futures = new ArrayList<>();
			futures.add(pool.submit(sweep));
			futures.add(pool.submit(sweep));
			gate.countDown();
			first = futures.get(0).get();
			second = futures.get(1).get();
		}

		assertEquals(1, first + second,
				"the guarded UPDATE lets exactly one runner claim the row (first=%d, second=%d)"
						.formatted(first, second));
		assertEquals("NO_SHOW", statusOf(booking));
	}
}
