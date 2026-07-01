package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
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
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The headline U3 concurrency test (issue #6, AC-3 / invariant #2): many tourists try to book
 * the SAME {@code (set, date)} at once; exactly one must end {@code CONFIRMED} and every other
 * {@code SET_TAKEN} — never two winners, never an exception. Backed by the atomic
 * {@code INSERT ... ON CONFLICT} claim the create flow joins in one transaction, against a real
 * Postgres (an in-memory fake could not prove this). Also asserts exactly one booking row and
 * one availability row survive.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConcurrentReservationIT {

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	private SetId anyOnlineSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private long bookingRows(SetId set, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM booking WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(Long.class).single();
	}

	private long availabilityRows(SetId set, LocalDate date) {
		return jdbc.sql(
				"SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(Long.class).single();
	}

	private List<BookingOutcome> race(SetId set, LocalDate date, int contenders) throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		// Distinct guest emails so the customer upsert is not itself a point of contention —
		// the only contested resource under test is the (set, date) claim.
		Callable<BookingOutcome> attempt = () -> {
			startGate.await();
			return createBooking.create(new CreateBookingCommand(set, date,
					new GuestContact("c" + Thread.currentThread().threadId() + "@e.com", "Guest", "+355")));
		};
		try (ExecutorService pool = Executors.newFixedThreadPool(contenders)) {
			List<Future<BookingOutcome>> futures = new ArrayList<>();
			for (int i = 0; i < contenders; i++) {
				futures.add(pool.submit(attempt));
			}
			startGate.countDown();
			List<BookingOutcome> outcomes = new ArrayList<>();
			for (Future<BookingOutcome> f : futures) {
				outcomes.add(f.get(20, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	private static long confirmed(List<BookingOutcome> outcomes) {
		return outcomes.stream().filter(o -> o instanceof BookingOutcome.Confirmed).count();
	}

	private static long taken(List<BookingOutcome> outcomes) {
		return outcomes.stream().filter(o -> o == BookingOutcome.Rejected.SET_TAKEN).count();
	}

	@RepeatedTest(5)
	void exactlyOneWins(RepetitionInfo info) throws Exception {
		int contenders = 12;
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.now().plusYears(2).plusDays(info.getCurrentRepetition());

		List<BookingOutcome> outcomes = race(set, date, contenders);

		assertEquals(1, confirmed(outcomes),
				() -> "exactly one booking may be CONFIRMED, got " + outcomes);
		assertEquals(contenders - 1, taken(outcomes),
				() -> "every other attempt must be SET_TAKEN (no second win, no exception), got " + outcomes);
		assertEquals(1L, bookingRows(set, date), "exactly one booking row may exist");
		assertEquals(1L, availabilityRows(set, date), "exactly one availability row may exist");
	}
}
