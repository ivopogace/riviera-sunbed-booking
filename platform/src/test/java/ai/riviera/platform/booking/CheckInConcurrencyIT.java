package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
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
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.checkin.CompletedCheckIn;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The check-in transition (#583) at the SQL seam against real Postgres — the single-use property a
 * mocked {@code Bookings} cannot prove (AC-3), plus the venue and service-date guards the
 * {@code WHERE} clause carries.
 *
 * <p>Two concurrent scans of one code both run the guarded {@code CONFIRMED → COMPLETED}
 * {@code UPDATE … RETURNING}; the row lock leaves exactly one winner, and the loser's 0-row match
 * is what the service layer later classifies as "already checked in".
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CheckInConcurrencyIT {

	private static final LocalDate SERVICE_DATE = LocalDate.of(2033, 7, 15);

	@Autowired
	Bookings bookings;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private long setId;

	@BeforeEach
	void seedVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('CheckIn Club', 'CheckIn Beach', 'CheckIn Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	private long insertConfirmed(String code, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	@RepeatedTest(3)
	void concurrentScansYieldExactlyOneTransition() throws Exception {
		String code = uniqueCode("CIRACE");
		long bookingId = insertConfirmed(code, SERVICE_DATE);

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Optional<CompletedCheckIn>> scan = () -> {
			gate.await();
			return bookings.completeConfirmed(code, new VenueId(venueId), SERVICE_DATE, Instant.now());
		};

		Optional<CompletedCheckIn> first;
		Optional<CompletedCheckIn> second;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			List<Future<Optional<CompletedCheckIn>>> futures = new ArrayList<>();
			futures.add(pool.submit(scan));
			futures.add(pool.submit(scan));
			gate.countDown();
			first = futures.get(0).get();
			second = futures.get(1).get();
		}

		assertTrue(first.isPresent() ^ second.isPresent(),
				"exactly one scan may transition the row (first=%s, second=%s)".formatted(first, second));
		CompletedCheckIn winner = first.or(() -> second).orElseThrow();
		assertEquals(bookingId, winner.bookingId());
		assertEquals(setId, winner.setId().value());
		assertEquals("COMPLETED", statusOf(bookingId));
		assertNotNull(jdbc.sql("SELECT completed_at FROM booking WHERE id = :id")
				.param("id", bookingId).query(Instant.class).single(),
				"the transition stamps completed_at (V40)");
	}

	@Test
	void completeIsGuardedByServiceDate() {
		String code = uniqueCode("CIDATE");
		long bookingId = insertConfirmed(code, SERVICE_DATE);

		Optional<CompletedCheckIn> wrongDay = bookings.completeConfirmed(
				code, new VenueId(venueId), SERVICE_DATE.plusDays(1), Instant.now());

		assertTrue(wrongDay.isEmpty(), "a scan on another day must not complete the booking");
		assertEquals("CONFIRMED", statusOf(bookingId));
	}

	@Test
	void completeIsGuardedByVenue() {
		String code = uniqueCode("CIVENUE");
		long bookingId = insertConfirmed(code, SERVICE_DATE);

		Optional<CompletedCheckIn> foreign = bookings.completeConfirmed(
				code, new VenueId(venueId + 1), SERVICE_DATE, Instant.now());

		assertTrue(foreign.isEmpty(), "another venue's scan must not complete the booking");
		assertEquals("CONFIRMED", statusOf(bookingId));
	}

	@Test
	void completeIsGuardedByStatus() {
		String code = uniqueCode("CIDONE");
		long bookingId = insertConfirmed(code, SERVICE_DATE);
		jdbc.sql("UPDATE booking SET status = 'CANCELLED', cancelled_at = now() WHERE id = :id")
				.param("id", bookingId).update();

		Optional<CompletedCheckIn> cancelled = bookings.completeConfirmed(
				code, new VenueId(venueId), SERVICE_DATE, Instant.now());

		assertTrue(cancelled.isEmpty(), "only a CONFIRMED booking can be checked in");
		assertEquals("CANCELLED", statusOf(bookingId));
	}
}
