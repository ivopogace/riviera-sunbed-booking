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
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Request-to-Book concurrency under ADR-0025: many tourists request the SAME {@code (set, date)} of a
 * REQUEST-mode venue at once, and every one of them ends {@code PENDING_REQUEST} — a request is not a
 * hold, so nothing contends; no availability row is written and no payment gateway is touched (the
 * default stub profile would confirm synchronously — a {@code Requested} outcome proves the request
 * branch, not the instant one, ran). The venue picks among them at accept time
 * ({@code ConcurrentOverlappingAcceptIT}).
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
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Request Beach Club', 'KSAMIL', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, venueId);
		requestModeSet = new SetId(jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single());
	}

	@Test
	void everyContenderEndsPendingAndNothingIsHeld() throws Exception {
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
		assertEquals(contenders, requested, "a request holds nothing, so every contender is pending (ADR-0025)");

		assertEquals(contenders, count("SELECT count(*) FROM booking WHERE set_id = :id AND booking_date = :date"
						+ " AND status = 'PENDING_REQUEST'"),
				"one PENDING_REQUEST row per contender");
		assertEquals(0, count("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date"),
				"no availability row — the accept claims, not the request");
		assertEquals(0, count("SELECT count(*) FROM payment_booking p JOIN booking b ON p.booking_ref = b.id "
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
