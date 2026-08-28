package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.domain.CancellationWindow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the evening-before cutoff arithmetic (issue #6, AC-5 / invariants #4, #6): a date
 * is bookable until its cutoff time the day before, computed in {@code Europe/Tirane} from a
 * fixed UTC clock — never the JVM default zone. Pure unit test (real {@link BookingCutoff} +
 * {@code Clock.fixed}).
 */
class BookingCutoffTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalTime CUTOFF = LocalTime.of(18, 0);
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 7, 15);

	private BookingCutoff at(ZonedDateTime tiraneNow) {
		return new BookingCutoff(Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC")));
	}

	@Test
	void bookableJustBeforeCutoff() {
		// 17:59 Tirane on the evening before — one minute before close.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 14, 17, 59, 0, 0, TIRANE));
		assertTrue(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedAtCutoff() {
		// Exactly 18:00 Tirane the evening before — closed (strictly-before rule).
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 14, 18, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedForSameDay() {
		// Morning of the booking date — long past the evening-before cutoff.
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
	}

	@Test
	void closedForPastDate() {
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 20, 9, 0, 0, 0, TIRANE));
		assertFalse(cutoff.isBookable(CUTOFF, BOOKING_DATE));
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
	void serviceDayHasOpenedOnlyFromMidnight() {
		assertFalse(at(ZonedDateTime.of(2026, 7, 14, 23, 59, 59, 0, TIRANE))
				.serviceDayHasOpened(BOOKING_DATE));
		assertTrue(at(ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, TIRANE))
				.serviceDayHasOpened(BOOKING_DATE));
		assertTrue(at(ZonedDateTime.of(2026, 7, 16, 9, 0, 0, 0, TIRANE))
				.serviceDayHasOpened(BOOKING_DATE));
	}

	@Test
	void lastOpenedServiceDayIsTheTiraneCivilDate() {
		BookingCutoff cutoff = at(ZonedDateTime.of(2026, 7, 1, 9, 0, 0, 0, TIRANE));
		assertEquals(LocalDate.of(2026, 7, 14),
				cutoff.lastOpenedServiceDay(ZonedDateTime.of(2026, 7, 14, 23, 59, 0, 0, TIRANE).toInstant()));
		assertEquals(BOOKING_DATE,
				cutoff.lastOpenedServiceDay(ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, TIRANE).toInstant()));
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
