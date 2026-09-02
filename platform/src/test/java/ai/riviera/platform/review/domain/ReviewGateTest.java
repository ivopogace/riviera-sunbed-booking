package ai.riviera.platform.review.domain;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;


import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The fence order, one case per state. This is where the order is pinned for every surface that
 * consults it — the write path and the code-gated read both call {@code stateOf}, so a case proved
 * here holds for both rather than being asserted twice in two service tests. A hidden review is
 * decided before the window: "removed from public view" outranks "stays as written".
 */
class ReviewGateTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final Instant YESTERDAY = NOW.minus(Duration.ofDays(1));
	private static final Instant BEYOND_THE_WINDOW = NOW.minus(Duration.ofDays(61));

	@Test
	void aCheckedInUnratedStayInsideTheWindowIsEligible() {
		assertEquals(ReviewState.ELIGIBLE, ReviewGate.stateOf(true, YESTERDAY, ReviewSlot.EMPTY, NOW));
	}

	@Test
	void aRatedStayInsideTheWindowIsAlreadyReviewed() {
		assertEquals(ReviewState.ALREADY_REVIEWED, ReviewGate.stateOf(true, YESTERDAY, ReviewSlot.TAKEN, NOW));
	}

	@Test
	void aStayCheckedInBeyondTheWindowIsFrozen() {
		assertEquals(ReviewState.WINDOW_CLOSED,
				ReviewGate.stateOf(true, BEYOND_THE_WINDOW, ReviewSlot.EMPTY, NOW));
	}

	@Test
	void ratedAndFrozenReadsAsFrozen() {
		assertEquals(ReviewState.WINDOW_CLOSED,
				ReviewGate.stateOf(true, BEYOND_THE_WINDOW, ReviewSlot.TAKEN, NOW));
	}

	@Test
	void aHiddenReviewReadsAsHiddenEvenPastTheWindow() {
		assertEquals(ReviewState.HIDDEN, ReviewGate.stateOf(true, YESTERDAY, ReviewSlot.HIDDEN, NOW));
		assertEquals(ReviewState.HIDDEN,
				ReviewGate.stateOf(true, BEYOND_THE_WINDOW, ReviewSlot.HIDDEN, NOW));
	}

	@Test
	void aBookingThatWasNeverCheckedInIsNotCompleted() {
		assertEquals(ReviewState.NOT_COMPLETED, ReviewGate.stateOf(true, null, ReviewSlot.EMPTY, NOW));
	}

	@Test
	void aCodeNoBookingAnswersToIsNoSuchStay() {
		assertEquals(ReviewState.NO_SUCH_STAY, ReviewGate.stateOf(false, null, ReviewSlot.EMPTY, NOW));
	}

	@Test
	void theWindowsLastInstantIsStillOpen() {
		assertEquals(ReviewState.ELIGIBLE,
				ReviewGate.stateOf(true, NOW.minus(ReviewWindow.WINDOW), ReviewSlot.EMPTY, NOW));
	}
}
