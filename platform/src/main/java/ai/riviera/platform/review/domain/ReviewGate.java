package ai.riviera.platform.review.domain;

import java.time.Instant;


/**
 * The order the review fences apply in, as one pure function: unknown booking, then never checked
 * in, then hidden by an admin, then window closed, then already rated, then eligible.
 *
 * <p>The order is the point. Every path that asks whether a stay may be rated — submit, edit,
 * delete, and the code-gated read — asks here, so a stay that trips two fences at once is told the
 * same thing whichever surface asks: a rated stay past its window reads as frozen, never as already
 * reviewed. That agreement is a property of there being one statement of the order, not of four
 * services being kept in step.
 *
 * @see ReviewWindow
 */
public final class ReviewGate {

	private ReviewGate() {
	}

	/**
	 * Where the stay behind a booking code stands right now.
	 *
	 * @param bookingExists whether any booking answers to the code, whatever its status
	 * @param completedAt   the check-in instant, or {@code null} when the stay was never checked in
	 * @param slot          what this stay's one review slot holds
	 */
	public static ReviewState stateOf(boolean bookingExists, Instant completedAt, ReviewSlot slot,
			Instant now) {
		if (completedAt == null) {
			return bookingExists ? ReviewState.NOT_COMPLETED : ReviewState.NO_SUCH_STAY;
		}
		if (slot == ReviewSlot.HIDDEN) {
			return ReviewState.HIDDEN;
		}
		if (!ReviewWindow.isOpen(completedAt, now)) {
			return ReviewState.WINDOW_CLOSED;
		}
		return slot == ReviewSlot.TAKEN ? ReviewState.ALREADY_REVIEWED : ReviewState.ELIGIBLE;
	}
}
