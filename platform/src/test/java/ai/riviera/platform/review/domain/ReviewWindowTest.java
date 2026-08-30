package ai.riviera.platform.review.domain;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The review window (AC-4): a stay stays reviewable for 60 days after check-in, then freezes.
 * Pure {@code Duration} arithmetic over UTC instants (invariant #6) — no timezone reasoning, so
 * these cases are the whole rule.
 */
class ReviewWindowTest {

	private static final Instant CHECKED_IN = Instant.parse("2026-06-01T14:00:00Z");

	@Test
	void openTheMomentTheStayIsCheckedIn() {
		assertTrue(ReviewWindow.isOpen(CHECKED_IN, CHECKED_IN));
	}

	@Test
	void openWellInsideTheWindow() {
		assertTrue(ReviewWindow.isOpen(CHECKED_IN, CHECKED_IN.plus(Duration.ofDays(59))));
	}

	@Test
	void openOnTheLastInstantOfTheWindow() {
		assertTrue(ReviewWindow.isOpen(CHECKED_IN, CHECKED_IN.plus(Duration.ofDays(60))));
	}

	@Test
	void closedOnceThePastSixtiethDay() {
		assertFalse(ReviewWindow.isOpen(CHECKED_IN,
				CHECKED_IN.plus(Duration.ofDays(60)).plusSeconds(1)));
		assertFalse(ReviewWindow.isOpen(CHECKED_IN, CHECKED_IN.plus(Duration.ofDays(61))));
	}
}
