package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the day's boundaries (invariant #4, #6): a date is bookable until its venue's
 * sales close on the day itself; free cancellation ends the evening before; the service
 * day opens at midnight and ends at the next one (the pay deadline's outer bound). All arithmetic
 * computed in {@code Europe/Tirane} from a fixed UTC clock — never the JVM default zone. Pure unit
 * test (real {@link BookingCutoff} + {@code Clock.fixed}).
 */
class BookingCutoffTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalTime CUTOFF = LocalTime.of(18, 0);
	private static final LocalTime SALES_CLOSE_1600 = LocalTime.of(16, 0);
	private static final LocalTime SALES_CLOSE_0001 = LocalTime.of(0, 1);
	private static final LocalTime SALES_CLOSE_2359 = LocalTime.of(23, 59);
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 7, 15);

	private BookingCutoff at(ZonedDateTime tiraneNow) {
		return new BookingCutoff(Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC")));
	}

	@Test
	void bookableTheEveningBefore() {
		// The retired evening-before fence: 20:00 on D-1 is now inside the window (#791).
		assertTrue(at(ZonedDateTime.of(2026, 7, 14, 20, 0, 0, 0, TIRANE))
				.isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void sameDayBookableUntilSalesClose() {
		assertTrue(at(ZonedDateTime.of(2026, 7, 15, 15, 59, 0, 0, TIRANE))
				.isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void closedAtSalesClose() {
		// Strictly-before rule: exactly 16:00 on D itself is closed.
		assertFalse(at(ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, TIRANE))
				.isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void optOutVenueSellsNothingOnTheDay() {
		// A 00:01 sales close reproduces the old no-same-day behavior.
		assertFalse(at(ZonedDateTime.of(2026, 7, 15, 0, 1, 0, 0, TIRANE))
				.isBookable(SALES_CLOSE_0001, BOOKING_DATE));
	}

	@Test
	void lateCloseSellsToElevenFiftyNine() {
		assertTrue(at(ZonedDateTime.of(2026, 7, 15, 23, 58, 0, 0, TIRANE))
				.isBookable(SALES_CLOSE_2359, BOOKING_DATE));
	}

	@Test
	void closedForPastDate() {
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 20, 9, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(SALES_CLOSE_1600, BOOKING_DATE));
	}

	@Test
	void cancellationWindowSpansFreeThenLate() {
		// FREE shares the evening-before boundary that closes booking (invariant #4: one rule, two jobs).
		assertEquals(CancellationWindow.FREE, at(ZonedDateTime.of(2026, 7, 14, 17, 59, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
		assertEquals(CancellationWindow.LATE, at(ZonedDateTime.of(2026, 7, 14, 18, 0, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
		assertEquals(CancellationWindow.LATE, at(ZonedDateTime.of(2026, 7, 14, 23, 59, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
	}

	@Test
	void cancellationWindowClosesWhenServiceDayStarts() {
		// The fence: once the guest can start consuming the stay, cancelling is refused.
		assertEquals(CancellationWindow.CLOSED, at(ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
		assertEquals(CancellationWindow.CLOSED, at(ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
		assertEquals(CancellationWindow.CLOSED, at(ZonedDateTime.of(2026, 7, 22, 9, 0, 0, 0, TIRANE))
				.cancellationWindow(CUTOFF, BOOKING_DATE));
	}

	@Test
	void serviceDayOpensAtMidnightInTirane() {
		// 2026-07-14T22:00Z is 2026-07-15T00:00 in Tirane (CEST, UTC+2).
		assertEquals(ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, TIRANE).toInstant(),
				at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE)).serviceDayOpensAt(BOOKING_DATE));
	}

	@Test
	void serviceDayEndsAtTheNextTiraneMidnight() {
		// 2026-07-15T22:00Z is 2026-07-16T00:00 in Tirane (CEST, UTC+2).
		assertEquals(ZonedDateTime.of(2026, 7, 16, 0, 0, 0, 0, TIRANE).toInstant(),
				at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE)).serviceDayEndsAt(BOOKING_DATE));
	}

	@Test
	void serviceDayEndsAtHandlesTheDstShoulder() {
		// The night into 2026-10-25 repeats 02:00–03:00 in Tirane; the D+1 midnight stays unambiguous (R-6).
		assertEquals(ZonedDateTime.of(2026, 10, 25, 0, 0, 0, 0, TIRANE).toInstant(),
				at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE)).serviceDayEndsAt(LocalDate.of(2026, 10, 24)));
	}

	@Test
	void serviceDayHasEndedOnlyAfterItsLastInstant() {
		assertFalse(at(ZonedDateTime.of(2026, 7, 15, 23, 59, 59, 0, TIRANE))
				.serviceDayHasEnded(BOOKING_DATE));
		assertTrue(at(ZonedDateTime.of(2026, 7, 16, 0, 0, 0, 0, TIRANE))
				.serviceDayHasEnded(BOOKING_DATE));
		assertTrue(at(ZonedDateTime.of(2026, 7, 17, 9, 0, 0, 0, TIRANE))
				.serviceDayHasEnded(BOOKING_DATE));
	}

	@Test
	void lastEndedServiceDayIsYesterdayInTirane() {
		assertEquals(LocalDate.of(2026, 7, 14),
				BookingCutoff.lastEndedServiceDay(ZonedDateTime.of(2026, 7, 15, 23, 59, 0, 0, TIRANE).toInstant()));
		assertEquals(BOOKING_DATE,
				BookingCutoff.lastEndedServiceDay(ZonedDateTime.of(2026, 7, 16, 0, 0, 0, 0, TIRANE).toInstant()));
	}

	@Test
	void salesCloseAtIsTheGivenTimeOnTheBookingDateInTirane() {
		// #791: unlike the evening-before freeCancellationEndsAt, salesCloseAt lands on D itself.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE));
		assertEquals(ZonedDateTime.of(2026, 7, 15, 16, 0, 0, 0, TIRANE).toInstant(),
				cutoff.salesCloseAt(LocalTime.of(16, 0), BOOKING_DATE));
		assertEquals(ZonedDateTime.of(2026, 7, 15, 0, 1, 0, 0, TIRANE).toInstant(),
				cutoff.salesCloseAt(LocalTime.of(0, 1), BOOKING_DATE));
		assertEquals(ZonedDateTime.of(2026, 7, 15, 23, 59, 0, 0, TIRANE).toInstant(),
				cutoff.salesCloseAt(LocalTime.of(23, 59), BOOKING_DATE));
	}

	@Test
	void salesCloseAtHandlesTheDstShoulder() {
		// Tirane's DST-shoulder date (2026-10-25); 16:00 sits well outside the fold hour (R-4).
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE));
		LocalDate dstShoulder = LocalDate.of(2026, 10, 25);
		assertEquals(ZonedDateTime.of(2026, 10, 25, 16, 0, 0, 0, TIRANE).toInstant(),
				cutoff.salesCloseAt(LocalTime.of(16, 0), dstShoulder));
	}

	@Test
	void classifiesWindowAtACallerSuppliedInstant() {
		// The clock reads a July instant; classification follows the supplied August birth instant.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE));
		Instant bornSameDay = ZonedDateTime.of(2026, 8, 30, 9, 0, 0, 0, TIRANE).toInstant();
		assertEquals(CancellationWindow.CLOSED,
				cutoff.cancellationWindow(CUTOFF, LocalDate.of(2026, 8, 30), bornSameDay));
		Instant bornLateEvening = ZonedDateTime.of(2026, 8, 29, 21, 0, 0, 0, TIRANE).toInstant();
		assertEquals(CancellationWindow.LATE,
				cutoff.cancellationWindow(CUTOFF, LocalDate.of(2026, 8, 30), bornLateEvening));
		Instant bornWellAhead = ZonedDateTime.of(2026, 8, 28, 12, 0, 0, 0, TIRANE).toInstant();
		assertEquals(CancellationWindow.FREE,
				cutoff.cancellationWindow(CUTOFF, LocalDate.of(2026, 8, 30), bornWellAhead));
	}

	@Test
	void boundaryInstantsAreLeftClosed() {
		// Domain-model S-3: exactly AT the deadline is already LATE; exactly AT 00:00 on D is CLOSED.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE));
		Instant atDeadline = ZonedDateTime.of(2026, 8, 29, 18, 0, 0, 0, TIRANE).toInstant();
		assertEquals(CancellationWindow.LATE,
				cutoff.cancellationWindow(CUTOFF, LocalDate.of(2026, 8, 30), atDeadline));
		Instant atDayOpen = ZonedDateTime.of(2026, 8, 30, 0, 0, 0, 0, TIRANE).toInstant();
		assertEquals(CancellationWindow.CLOSED,
				cutoff.cancellationWindow(CUTOFF, LocalDate.of(2026, 8, 30), atDayOpen));
	}

	@Test
	void cancellationWindowIgnoresACutoffLaterThanMidnight() {
		// A 23:30 cutoff leaves FREE and CLOSED 30 minutes apart, not inverted.
		LocalTime lateCutoff = LocalTime.of(23, 30);
		assertEquals(CancellationWindow.FREE, at(ZonedDateTime.of(2026, 7, 14, 23, 29, 0, 0, TIRANE))
				.cancellationWindow(lateCutoff, BOOKING_DATE));
		assertEquals(CancellationWindow.LATE, at(ZonedDateTime.of(2026, 7, 14, 23, 31, 0, 0, TIRANE))
				.cancellationWindow(lateCutoff, BOOKING_DATE));
		assertEquals(CancellationWindow.CLOSED, at(ZonedDateTime.of(2026, 7, 15, 0, 1, 0, 0, TIRANE))
				.cancellationWindow(lateCutoff, BOOKING_DATE));
	}
}
