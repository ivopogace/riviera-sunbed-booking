package ai.riviera.platform.review.api;

import ai.riviera.platform.review.vocabulary.ReviewState;

/**
 * Whether the stay behind a booking code may be reviewed right now — the verdict the code-gated
 * booking view turns into its server-owned {@code reviewable} flag, so the client renders from
 * server truth instead of re-deriving the fences from a status.
 *
 * <p>Split from {@link VenueRatingSummary} by consumer role (#94): this one answers a guest's
 * question about one stay, that one answers a venue's question about its own aggregate. Neither
 * consumer sees the submit surface, which stays internal to {@code review.application}.
 */
public interface ReviewEligibility {

	/**
	 * The review state of the stay behind {@code bookingCode} — {@code NO_SUCH_STAY} when no booking
	 * answers to it, so a caller can keep its own non-enumerating answer.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 */
	ReviewState stateFor(String bookingCode);
}
