package ai.riviera.platform.review.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * How long a delivered stay stays reviewable: it opens at check-in and closes 60 days later, after
 * which the verdict is frozen. Pure {@link Duration} arithmetic over UTC instants (invariant #6) —
 * no timezone reasoning, because nothing about this rule turns on the venue's local day.
 */
public final class ReviewWindow {

	/** How long after check-in a stay stays reviewable. */
	public static final Duration WINDOW = Duration.ofDays(60);

	private ReviewWindow() {
	}

	/**
	 * Whether the window over a stay checked in at {@code completedAt} is still open at {@code now}.
	 * The boundary is inclusive: only a stay checked in <em>more</em> than {@link #WINDOW} ago closes.
	 */
	public static boolean isOpen(Instant completedAt, Instant now) {
		return !now.isAfter(completedAt.plus(WINDOW));
	}
}
