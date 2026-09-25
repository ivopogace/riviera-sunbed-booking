package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
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
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Invariant #2 for a stay: a range claim is all-or-nothing. Racing a single-day booking on one of
 * its days, exactly one of the two wins and the availability rows are either the whole range or
 * that one day — never a partial range. Against a day already held, the range loses whole and
 * leaves no row on its other days. Real Postgres via Testcontainers, the stub gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConcurrentRangeReservationIT {

	private static final int DAYS = 3;

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	/** The second seeded online set: the single-day race IT contends on the first. */
	private SetId rangeSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id OFFSET 1 LIMIT 1")
				.query(Long.class).single());
	}

	private static CreateBookingCommand range(SetId set, LocalDate first, String guest) {
		return new CreateBookingCommand(set, first, first.plusDays(DAYS - 1L),
				new GuestContact(guest + "@e.com", "Guest", "+355"), null);
	}

	private static CreateBookingCommand oneDay(SetId set, LocalDate day, String guest) {
		return new CreateBookingCommand(set, day, new GuestContact(guest + "@e.com", "Guest", "+355"));
	}

	private List<LocalDate> heldDays(SetId set, LocalDate first) {
		return jdbc.sql("SELECT booking_date FROM set_availability WHERE set_id = :s "
						+ "AND booking_date BETWEEN :first AND :last ORDER BY booking_date")
				.param("s", set.value()).param("first", first).param("last", first.plusDays(DAYS - 1L))
				.query(LocalDate.class).list();
	}

	@RepeatedTest(5)
	void rangeAndSingleDayNeverBothWin(RepetitionInfo info) throws Exception {
		SetId set = rangeSet();
		LocalDate first = LocalDate.now().plusYears(3).plusDays(info.getCurrentRepetition() * 10L);
		LocalDate middle = first.plusDays(1);
		CountDownLatch startGate = new CountDownLatch(1);

		BookingOutcome rangeOutcome;
		BookingOutcome dayOutcome;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<BookingOutcome> rangeAttempt = pool.submit(() -> {
				startGate.await();
				return createBooking.create(range(set, first, "range" + info.getCurrentRepetition()));
			});
			Future<BookingOutcome> dayAttempt = pool.submit(() -> {
				startGate.await();
				return createBooking.create(oneDay(set, middle, "day" + info.getCurrentRepetition()));
			});
			startGate.countDown();
			rangeOutcome = rangeAttempt.get(20, TimeUnit.SECONDS);
			dayOutcome = dayAttempt.get(20, TimeUnit.SECONDS);
		}

		boolean rangeWon = rangeOutcome instanceof BookingOutcome.Confirmed;
		boolean dayWon = dayOutcome instanceof BookingOutcome.Confirmed;
		assertTrue(rangeWon ^ dayWon, () -> "exactly one may win, got range=" + rangeOutcome + " day=" + dayOutcome);
		if (rangeWon) {
			assertSame(BookingOutcome.Rejected.SET_TAKEN, dayOutcome);
			assertEquals(List.of(first, middle, first.plusDays(2)), heldDays(set, first), "the whole range is held");
		}
		else {
			assertSame(BookingOutcome.Rejected.SET_TAKEN, rangeOutcome);
			assertEquals(List.of(middle), heldDays(set, first), "only the single day is held — no partial range");
		}
	}

	@Test
	void aLostDayLeavesNoPartialClaim() {
		SetId set = rangeSet();
		LocalDate first = LocalDate.now().plusYears(4);
		LocalDate middle = first.plusDays(1);
		assertTrue(createBooking.create(oneDay(set, middle, "holder")) instanceof BookingOutcome.Confirmed);

		BookingOutcome outcome = createBooking.create(range(set, first, "latecomer"));

		assertSame(BookingOutcome.Rejected.SET_TAKEN, outcome);
		assertEquals(List.of(middle), heldDays(set, first), "the range left nothing on its other days");
		assertEquals(1L, jdbc.sql("SELECT count(*) FROM booking WHERE set_id = :s AND booking_date >= :d")
				.param("s", set.value()).param("d", first).query(Long.class).single(), "no range booking row");
	}
}
