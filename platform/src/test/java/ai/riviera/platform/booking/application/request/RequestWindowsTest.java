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
 * <p>The identity is what makes it structural: {@link RequestWindows#payDeadline} is what the accept
 * mails, {@link RequestWindows#acceptedBefore} is the cutoff the sweep's {@code accepted_at <
 * :acceptedBefore} predicate binds, and they are exact inverses off one field. Previously the
 * second half lived as {@code now.minus(payWindow)} inside {@code AbandonedBookingSweepService}, so
 * a mailed deadline could only ever have been checked against it by eye.
 */
class RequestWindowsTest {

	private static final Duration PAY_WINDOW = Duration.ofHours(12);

	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), PAY_WINDOW);

	private static final Instant ACCEPTED_AT = Instant.parse("2026-07-10T08:00:00Z");

	@Test
	void payDeadlineRunsFromTheAcceptClock() {
		assertEquals(ACCEPTED_AT.plus(PAY_WINDOW), WINDOWS.payDeadline(ACCEPTED_AT),
				"the guest's window opens at accepted_at, never at created_at");
	}

	@Test
	void theMailedDeadlineIsExactlyTheSweepsCutoff() {
		Instant deadline = WINDOWS.payDeadline(ACCEPTED_AT);

		assertFalse(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline)),
				"at the deadline the booking is not yet expirable — the mail may not promise a moment "
						+ "the sweep has already passed");
		assertTrue(ACCEPTED_AT.isBefore(WINDOWS.acceptedBefore(deadline.plusMillis(1))),
				"one millisecond later it is: the deadline is the exact boundary, not an approximation");
	}
}
