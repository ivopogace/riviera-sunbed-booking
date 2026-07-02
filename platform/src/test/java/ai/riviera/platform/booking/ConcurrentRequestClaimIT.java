package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Request-to-Book concurrency (issue #98, AC-2 / invariant #2): many tourists request the SAME
 * {@code (set, date)} of a REQUEST-mode venue at once; exactly one must end
 * {@code PENDING_REQUEST} and every other {@code SET_TAKEN} — the soft-hold is the same atomic
 * {@code INSERT … ON CONFLICT} claim as Instant Book, against real Postgres. Also proves exactly
 * one booking row and one availability row survive, and that no payment gateway is touched (the
 * default stub profile would confirm synchronously — a {@code Requested} outcome proves the
 * request branch, not the instant one, ran).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConcurrentRequestClaimIT {

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	private SetId requestModeSet;

	@BeforeEach
	void seedRequestVenue() {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Request Beach Club', 'Race Beach', 'Race Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		requestModeSet = new SetId(jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single());
	}

	@Test
	void exactlyOnePendingRequestUnderContention() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(2);
		int contenders = 8;

		CountDownLatch startGate = new CountDownLatch(1);
		Callable<BookingOutcome> attempt = () -> {
			startGate.await();
			return createBooking.create(new CreateBookingCommand(requestModeSet, date,
					new GuestContact("r" + Thread.currentThread().threadId() + "@e.com", "Guest", "+355")));
		};
		List<BookingOutcome> outcomes = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(contenders)) {
			List<Future<BookingOutcome>> futures = new ArrayList<>();
			for (int i = 0; i < contenders; i++) {
				futures.add(pool.submit(attempt));
			}
			startGate.countDown();
			for (Future<BookingOutcome> f : futures) {
				outcomes.add(f.get());
			}
		}

		long requested = outcomes.stream().filter(BookingOutcome.Requested.class::isInstance).count();
		long taken = outcomes.stream().filter(o -> o == BookingOutcome.Rejected.SET_TAKEN).count();
		assertEquals(1, requested, "exactly one contender wins the soft-hold (invariant #2)");
		assertEquals(contenders - 1, taken, "every loser gets SET_TAKEN, never an exception");

		assertEquals(1, count("SELECT count(*) FROM booking WHERE set_id = :id AND booking_date = :date"),
				"one PENDING_REQUEST booking row survives");
		assertEquals("PENDING_REQUEST", jdbc.sql(
				"SELECT status FROM booking WHERE set_id = :id AND booking_date = :date")
				.param("id", requestModeSet.value()).param("date", date).query(String.class).single());
		assertEquals(1, count("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date"),
				"one availability row — the soft-hold IS the claim row");
		assertEquals(0, count("SELECT count(*) FROM payment p JOIN booking b ON p.booking_ref = b.id "
						+ "WHERE b.set_id = :id AND b.booking_date = :date"),
				"no PaymentIntent exists for a pending request (payment-request-on-accept)");
	}

	private long count(String sql) {
		return jdbc.sql(sql)
				.param("id", requestModeSet.value())
				.param("date", LocalDate.now().plusMonths(2))
				.query(Long.class).single();
	}
}
