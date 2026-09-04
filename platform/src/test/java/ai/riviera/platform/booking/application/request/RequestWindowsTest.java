package ai.riviera.platform.booking.application.request;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The pay window read from both ends. The payment-due mail promises a deadline and the
 * abandoned sweep enforces one; the AC is that they are the <em>same</em> instant, which this
 * pins as an arithmetic identity rather than as two hand-checked formulas.
 *
 * <p>The identity holds for the <strong>raw window</strong>: {@link RequestWindows#payDeadline} is
 * what the accept mails, {@link RequestWindows#acceptedBefore} is the cutoff the sweep's
 * {@code accepted_at < :acceptedBefore} predicate binds, and they are exact inverses off one field.
 * The day-end cap is the second, disjoint bound — the sweep binds it as its own predicate on
 * {@code booking_date}, so the identity below is stated against an uncapped deadline and the cap
 * gets its own cases.
 *
 * <p>{@link RequestWindows#payWindowClosed} reads the same two bounds from the other side, for the
 * code-gated view: the cases below pin each arm at its exact edge — accepted strict, day end
 * inclusive — because that asymmetry is what the sweep's SQL spells as {@code <} and {@code <=},
 * and an instant booking is closed by neither.
 */
class RequestWindowsTest {

	private static final Duration PAY_WINDOW = Duration.ofHours(12);

	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), PAY_WINDOW);

	private static final Instant ACCEPTED_AT = Instant.parse("2026-07-10T08:00:00Z");

	/** Far enough out that the raw window always ends first — these cases isolate the window. */
	private static final Instant DISTANT_DAY_END = Instant.parse("2026-07-20T22:00:00Z");

	@Test
	void payDeadlineRunsFromTheAcceptClock() {
		assertEquals(ACCEPTED_AT.plus(PAY_WINDOW), WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_DAY_END),
				"the guest's window opens at accepted_at, never at created_at");
	}

	@Test
	void theMailedDeadlineIsExactlyTheSweepsCutoff() {
		Instant deadline = WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_DAY_END);

		assertFalse(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline)),
				"at the deadline the booking is not yet expirable — the mail may not promise a moment "
						+ "the sweep has already passed");
		assertTrue(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline.plusMillis(1))),
				"one millisecond later it is: the deadline is the exact boundary, not an approximation");
	}

	@Test
	void payDeadlineIsCappedAtTheEndOfTheServiceDay() {
		// Same-day accept at 17:30 Tirane: the raw 12h window would cross into the next day (#792).
		Instant acceptedAt = Instant.parse("2026-07-14T15:30:00Z");
		Instant serviceDayEndsAt = Instant.parse("2026-07-14T22:00:00Z");

		assertEquals(serviceDayEndsAt, WINDOWS.payDeadline(acceptedAt, serviceDayEndsAt),
				"the cap binds whenever the raw window would outrun the service day's end");
	}

	@Test
	void payDeadlineKeepsTheRawWindowWhenItEndsFirst() {
		// One millisecond of margin — the tightest case in which the window, not the cap, wins.
		Instant serviceDayEndsAt = ACCEPTED_AT.plus(PAY_WINDOW).plusMillis(1);

		assertEquals(ACCEPTED_AT.plus(PAY_WINDOW), WINDOWS.payDeadline(ACCEPTED_AT, serviceDayEndsAt),
				"a comparison the wrong way round would take the cap here");
	}

	@Test
	void payDeadlineTakesTheDayEndWhenTheyCoincide() {
		Instant serviceDayEndsAt = ACCEPTED_AT.plus(PAY_WINDOW);

		assertEquals(serviceDayEndsAt, WINDOWS.payDeadline(ACCEPTED_AT, serviceDayEndsAt),
				"an exact tie is the same instant either way — the boundary must not shift by a tick");
	}

	@Test
	void payWindowIsOpenAtTheMailedDeadlineItself() {
		Instant deadline = WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_DAY_END);

		assertFalse(WINDOWS.payWindowClosed(ACCEPTED_AT, DISTANT_DAY_END, deadline),
				"the promised instant is payable — the view may not hide a button the sweep still honours");
	}

	@Test
	void payWindowClosesOneTickAfterTheMailedDeadline() {
		Instant deadline = WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_DAY_END);

		assertTrue(WINDOWS.payWindowClosed(ACCEPTED_AT, DISTANT_DAY_END, deadline.plusMillis(1)),
				"the accepted arm is strict, exactly like the sweep's accepted_at < :acceptedBefore");
	}

	@Test
	void payWindowClosesAtTheServiceDayEndInstant() {
		assertFalse(WINDOWS.payWindowClosed(null, DISTANT_DAY_END, DISTANT_DAY_END.minusMillis(1)),
				"the day is not over until its last instant has passed");
		assertTrue(WINDOWS.payWindowClosed(null, DISTANT_DAY_END, DISTANT_DAY_END),
				"the day-end arm is inclusive, like the sweep's booking_date <= :serviceDayEndedOnOrBefore");
	}

	@Test
	void theDayEndClosesAnAcceptedBookingWhoseRawWindowStillHasTimeLeft() {
		// Accepted an hour before midnight: the 12h window would outrun the day the cap ends.
		Instant acceptedAt = DISTANT_DAY_END.minus(Duration.ofHours(1));

		assertTrue(WINDOWS.payWindowClosed(acceptedAt, DISTANT_DAY_END, DISTANT_DAY_END),
				"the cap binds the accepted arm too — the deadline is the earlier of the two");
	}

	@Test
	void theRawWindowNeverClosesAnInstantBooking() {
		Instant longPastTheWindow = ACCEPTED_AT.plus(PAY_WINDOW).plus(Duration.ofDays(1));

		assertFalse(WINDOWS.payWindowClosed(null, DISTANT_DAY_END, longPastTheWindow),
				"an instant booking has no accept clock: only its day's end and the sweep's TTL reach it");
	}
}
