package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Invariant #2 for a stitched stay: racing a one-day booking on a day of its second stretch, exactly
 * one wins, and the availability rows are either every day of every stretch or that one day — never
 * a stray day of the first stretch. Real Postgres via Testcontainers, the stub gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class ConcurrentStayReservationIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	@RepeatedTest(5)
	void stayAndSingleDayNeverBothWin(RepetitionInfo info) throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = LocalDate.now().plusYears(3).plusDays(info.getCurrentRepetition() * 10L);
		LocalDate contested = first.plusDays(4);
		CountDownLatch startGate = new CountDownLatch(1);

		StayOutcome stayOutcome;
		BookingOutcome dayOutcome;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<StayOutcome> stayAttempt = pool.submit(() -> {
				startGate.await();
				return createStay.create(plan(a, 3, b, 4, first));
			});
			Future<BookingOutcome> dayAttempt = pool.submit(() -> {
				startGate.await();
				return createBooking.create(new CreateBookingCommand(b, contested,
						new GuestContact("day" + info.getCurrentRepetition() + "@e.com", "Guest", "+355")));
			});
			startGate.countDown();
			stayOutcome = stayAttempt.get(20, TimeUnit.SECONDS);
			dayOutcome = dayAttempt.get(20, TimeUnit.SECONDS);
		}

		boolean stayWon = stayOutcome instanceof StayOutcome.Confirmed;
		boolean dayWon = dayOutcome instanceof BookingOutcome.Confirmed;
		assertTrue(stayWon ^ dayWon, () -> "exactly one may win, got stay=" + stayOutcome + " day=" + dayOutcome);
		if (stayWon) {
			assertSame(BookingOutcome.Rejected.SET_TAKEN, dayOutcome);
			assertEquals(3L, heldDays(jdbc, a, first, first.plusDays(6)));
			assertEquals(4L, heldDays(jdbc, b, first, first.plusDays(6)), "every day of every stretch is held");
		}
		else {
			assertEquals(new StayOutcome.Rejected(BookingOutcome.Rejected.SET_TAKEN), stayOutcome);
			assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)), "the first stretch left no stray day");
			assertEquals(1L, heldDays(jdbc, b, first, first.plusDays(6)), "only the single day is held");
		}
	}
}
