package ai.riviera.platform.review.domain;

import java.time.Instant;


/**
 * The order the review fences apply in, as one pure function: unknown booking, then never checked
 * in, then hidden by an admin, then window closed, then already rated, then eligible.
 *
 * <p>Submit, edit, delete and the code-gated read all ask here, so a stay tripping two fences gets
 * one answer on every surface (a rated stay past its window reads frozen, never already reviewed):
 * keep the order here, never restated per service.
 *
 * @see ReviewWindow
 */
public final class ReviewGate {

	private ReviewGate() {
	}

	/**
	 * Where the stay behind a booking code stands at {@code now}: {@code bookingExists} is whether
	 * any booking answers to the code, whatever its status; {@code completedAt} is {@code null}
	 * while the stay has not completed; {@code slot} is what the stay's one review slot holds.
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
