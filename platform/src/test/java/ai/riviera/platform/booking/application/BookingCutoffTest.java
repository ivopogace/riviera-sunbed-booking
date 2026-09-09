package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;

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

	// --- the season closure: the second arm of the sales fence, keyed on the civil day in Tirane ---

	private static final LocalDate REOPEN = LocalDate.of(2027, 5, 15);
	private static final SeasonClosure CLOSED_UNTIL_REOPEN = SeasonClosure.closed(REOPEN, false);
	private static final SeasonClosure CLOSED_SELLING_AHEAD = SeasonClosure.closed(REOPEN, true);
	private static final SeasonClosure CLOSED_INDEFINITELY = SeasonClosure.closed(null, false);
	/** 2027-05-14 23:59 in Tirane (CEST): the last minute before the reopen day. */
	private static final ZonedDateTime LAST_MINUTE_BEFORE_REOPEN = ZonedDateTime.of(2027, 5, 14, 23, 59, 0, 0, TIRANE);
	/** 2027-05-15 00:00 in Tirane — 2027-05-14T22:00Z, still the 14th in UTC. */
	private static final ZonedDateTime REOPEN_MIDNIGHT = ZonedDateTime.of(2027, 5, 15, 0, 0, 0, 0, TIRANE);

	@Test
	void anOpenVenueIsNeverClosedForSeason() {
		BookingCutoff cutoff = at(LAST_MINUTE_BEFORE_REOPEN);
		assertFalse(cutoff.closedForSeason(SeasonClosure.open(), LAST_MINUTE_BEFORE_REOPEN.toInstant()));
		assertTrue(cutoff.admitsDate(SeasonClosure.open(), REOPEN.plusDays(30), LAST_MINUTE_BEFORE_REOPEN.toInstant()));
	}

	@Test
	void closedForSeasonUntilTheReopenDayOpensInTirane() {
		BookingCutoff cutoff = at(LAST_MINUTE_BEFORE_REOPEN);
		assertTrue(cutoff.closedForSeason(CLOSED_UNTIL_REOPEN, LAST_MINUTE_BEFORE_REOPEN.toInstant()));
		assertFalse(cutoff.closedForSeason(CLOSED_UNTIL_REOPEN, REOPEN_MIDNIGHT.toInstant()));
		assertEquals(Instant.parse("2027-05-14T22:00:00Z"), REOPEN_MIDNIGHT.toInstant());
	}

	@Test
	void aClosureWithoutAReopenDateHoldsUntilReopenedByHand() {
		BookingCutoff cutoff = at(LAST_MINUTE_BEFORE_REOPEN);
		assertTrue(cutoff.closedForSeason(CLOSED_INDEFINITELY, REOPEN_MIDNIGHT.toInstant()));
		assertTrue(cutoff.closedForSeason(CLOSED_INDEFINITELY, REOPEN_MIDNIGHT.plusYears(1).toInstant()));
		assertFalse(cutoff.admitsDate(CLOSED_INDEFINITELY, REOPEN.plusYears(1), REOPEN_MIDNIGHT.toInstant()));
	}

	@Test
	void aClosedVenueAdmitsNoDateWithoutTheOptIn() {
		BookingCutoff cutoff = at(LAST_MINUTE_BEFORE_REOPEN);
		Instant now = LAST_MINUTE_BEFORE_REOPEN.toInstant();
		assertFalse(cutoff.admitsDate(CLOSED_UNTIL_REOPEN, REOPEN, now));
		assertFalse(cutoff.admitsDate(CLOSED_UNTIL_REOPEN, REOPEN.plusDays(30), now));
		assertFalse(cutoff.isBookable(SALES_CLOSE_1600, CLOSED_UNTIL_REOPEN, REOPEN.plusDays(30), now));
	}

	@Test
	void theOptInAdmitsDatesOnOrAfterTheReopenDateOnly() {
		BookingCutoff cutoff = at(LAST_MINUTE_BEFORE_REOPEN);
		Instant now = LAST_MINUTE_BEFORE_REOPEN.toInstant();
		assertTrue(cutoff.admitsDate(CLOSED_SELLING_AHEAD, REOPEN, now));
		assertTrue(cutoff.admitsDate(CLOSED_SELLING_AHEAD, REOPEN.plusDays(5), now));
		assertFalse(cutoff.admitsDate(CLOSED_SELLING_AHEAD, REOPEN.minusDays(1), now));
		assertTrue(cutoff.isBookable(SALES_CLOSE_1600, CLOSED_SELLING_AHEAD, REOPEN.plusDays(5), now));
	}

	@Test
	void onceReopenedEveryDateIsAdmittedAndTheSalesCloseStillFences() {
		BookingCutoff cutoff = at(REOPEN_MIDNIGHT);
		Instant now = REOPEN_MIDNIGHT.toInstant();
		assertTrue(cutoff.admitsDate(CLOSED_UNTIL_REOPEN, REOPEN, now));
		assertTrue(cutoff.isBookable(SALES_CLOSE_1600, CLOSED_UNTIL_REOPEN, REOPEN, now));
		// Admitted by the closure, refused by the on-day sales close: the two arms compose.
		assertFalse(cutoff.isBookable(SALES_CLOSE_0001, CLOSED_UNTIL_REOPEN, REOPEN,
				ZonedDateTime.of(2027, 5, 15, 0, 1, 0, 0, TIRANE).toInstant()));
	}
}
