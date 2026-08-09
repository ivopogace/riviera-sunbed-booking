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
 * The service-day cap is the second, disjoint bound — the sweep binds it as its own predicate on
 * {@code booking_date}, so the identity below is stated against an uncapped deadline and the cap
 * gets its own cases.
 */
class RequestWindowsTest {

	private static final Duration PAY_WINDOW = Duration.ofHours(12);

	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), PAY_WINDOW);

	private static final Instant ACCEPTED_AT = Instant.parse("2026-07-10T08:00:00Z");

	/** Far enough out that the raw window always ends first — these cases isolate the window. */
	private static final Instant DISTANT_SERVICE_DAY = Instant.parse("2026-07-20T22:00:00Z");

	@Test
	void payDeadlineRunsFromTheAcceptClock() {
		assertEquals(ACCEPTED_AT.plus(PAY_WINDOW), WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_SERVICE_DAY),
				"the guest's window opens at accepted_at, never at created_at");
	}

	@Test
	void theMailedDeadlineIsExactlyTheSweepsCutoff() {
		Instant deadline = WINDOWS.payDeadline(ACCEPTED_AT, DISTANT_SERVICE_DAY);

		assertFalse(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline)),
				"at the deadline the booking is not yet expirable — the mail may not promise a moment "
						+ "the sweep has already passed");
		assertTrue(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline.plusMillis(1))),
				"one millisecond later it is: the deadline is the exact boundary, not an approximation");
	}

	@Test
	void payDeadlineIsCappedAtTheServiceDayOpening() {
		// Accepted 17:30 Tirane: the raw 12h window would run to 05:30 on the service day.
		Instant acceptedAt = Instant.parse("2026-07-14T15:30:00Z");
		Instant serviceDayOpensAt = Instant.parse("2026-07-14T22:00:00Z");

		assertEquals(serviceDayOpensAt, WINDOWS.payDeadline(acceptedAt, serviceDayOpensAt),
				"the cap binds whenever the raw window would outrun the service day");
	}

	@Test
	void payDeadlineKeepsTheRawWindowWhenItEndsFirst() {
		// One millisecond of margin — the tightest case in which the window, not the cap, wins.
		Instant serviceDayOpensAt = ACCEPTED_AT.plus(PAY_WINDOW).plusMillis(1);

		assertEquals(ACCEPTED_AT.plus(PAY_WINDOW), WINDOWS.payDeadline(ACCEPTED_AT, serviceDayOpensAt),
				"a comparison the wrong way round would take the cap here");
	}

	@Test
	void payDeadlineTakesTheServiceDayOpeningWhenTheyCoincide() {
		Instant serviceDayOpensAt = ACCEPTED_AT.plus(PAY_WINDOW);

		assertEquals(serviceDayOpensAt, WINDOWS.payDeadline(ACCEPTED_AT, serviceDayOpensAt),
				"an exact tie is the same instant either way — the boundary must not shift by a tick");
	}
}
