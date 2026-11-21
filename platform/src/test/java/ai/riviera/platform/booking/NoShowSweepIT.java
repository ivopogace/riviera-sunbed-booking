package ai.riviera.platform.booking;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.booking.application.checkin.MarkNoShows;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The no-show sweep: a {@code CONFIRMED} booking whose service day has passed in
 * {@code Europe/Tirane} becomes {@code NO_SHOW}, because nothing checked it in. Today's and future
 * bookings, and anything already terminal, are untouched.
 *
 * <p>The sweep is platform-wide, not venue-scoped, so each test seeds on a venue of its own and asserts
 * only its own rows; the race reads the sweep's own count, so it drains first.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class NoShowSweepIT {

	@Autowired
	MarkNoShows markNoShows;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Clock clock;

	private long venueId;

	@BeforeEach
	void ownVenue() {
		venueId = StayFixtures.venue(jdbc, "INSTANT", null, false).id();
	}

	@AfterEach
	void removeVenue() {
		StayFixtures.cleanup(jdbc, venueId);
	}

	private LocalDate today() {
		return TiraneDaytimeClock.today(clock);
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	/**
	 * Seeds a booking whose companion columns match the status, rather than stamping every row as if
	 * it had been confirmed. A {@code PENDING_REQUEST} row with a NULL {@code request_expires_at} is
	 * not merely unrealistic — {@code findPendingRequestsForVenue} dereferences that timestamp, so
	 * leaving one in the shared container arms an NPE for any later test reading this venue's queue.
	 */
	private long insert(String code, LocalDate date, String status) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
		boolean everConfirmed = !List.of("PENDING_REQUEST", "AWAITING_PAYMENT", "DECLINED", "EXPIRED",
				"WITHDRAWN").contains(status);
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at,
				                     request_expires_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status,
				        CASE WHEN :confirmed THEN CAST(:now AS timestamptz) END,
				        CASE WHEN :pending THEN CAST(:now AS timestamptz) + interval '1 day' END)
				RETURNING id
				""").param("now", java.sql.Timestamp.from(clock.instant()))
				.param("code", code).param("venue", venueId).param("set", set)
				.param("cust", customer).param("date", date).param("status", status)
				.param("confirmed", everConfirmed)
				.param("pending", "PENDING_REQUEST".equals(status))
				.query(Long.class).single();
	}

	private long missedDaysOf(long bookingId) {
		return jdbc.sql("SELECT count(*) FROM booking_day WHERE booking_id = :id AND missed_at IS NOT NULL")
				.param("id", bookingId).query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	@Test
	void sweepsPastConfirmedBooking() {
		long yesterday = insert(uniqueCode("NSPAST"), today().minusDays(1), "CONFIRMED");
		long lastWeek = insert(uniqueCode("NSOLD"), today().minusDays(7), "CONFIRMED");

		markNoShows.sweep();

		assertEquals("NO_SHOW", statusOf(yesterday));
		assertEquals("NO_SHOW", statusOf(lastWeek));
	}

	@Test
	void leavesTodayAndFutureUntouched() {
		long todaysBooking = insert(uniqueCode("NSTODAY"), today(), "CONFIRMED");
		long tomorrow = insert(uniqueCode("NSFUTURE"), today().plusDays(1), "CONFIRMED");

		markNoShows.sweep();

		assertEquals("CONFIRMED", statusOf(todaysBooking));
		assertEquals("CONFIRMED", statusOf(tomorrow));
		assertEquals(0L, missedDaysOf(todaysBooking) + missedDaysOf(tomorrow), "no day still ahead is marked missed");
	}

	@Test
	void neverTouchesCheckedInBooking() {
		long completed = insert(uniqueCode("NSDONE"), today().minusDays(1), "CONFIRMED");
		jdbc.sql("UPDATE booking SET status = 'COMPLETED', completed_at = :now WHERE id = :id")
				.param("now", java.sql.Timestamp.from(clock.instant()))
				.param("id", completed).update();

		markNoShows.sweep();

		assertEquals("COMPLETED", statusOf(completed),
				"checked-in is the only path to COMPLETED and the sweep must never undo it");
	}

	@Test
	void secondRunIsANoOp() {
		long booking = insert(uniqueCode("NSTWICE"), today().minusDays(1), "CONFIRMED");

		markNoShows.sweep();
		assertEquals("NO_SHOW", statusOf(booking));
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

		markNoShows.sweep();

		for (int i = 0; i < untouchable.size(); i++) {
			assertEquals(untouchable.get(i), statusOf(ids.get(i)),
					"only CONFIRMED is swept; every other status is left exactly as it was");
		}
	}

	@RepeatedTest(3)
	void concurrentSweepsYieldExactlyOneTransition() throws Exception {
		markNoShows.sweep(); // the runners' counts are platform-wide, so another class's past row must not add to them
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
