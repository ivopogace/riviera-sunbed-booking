package ai.riviera.platform.review.vocabulary;

/**
 * Whether a booking may be reviewed right now, and if not, why — the answer
 * {@link ai.riviera.platform.review.api.ReviewEligibility} gives the code-gated read so the
 * frontend renders from server truth instead of re-deriving the fences.
 *
 * <p>Slice 1 collapses everything but {@link #ELIGIBLE} to "no panel"; the distinct reasons are
 * carried from the start because slice 2's messaging is keyed on them.
 */
public enum ReviewState {

	/** COMPLETED, inside the window, not yet reviewed — the submit path will accept. */
	ELIGIBLE,

	/** This stay already carries its one review; a second is refused for good. */
	ALREADY_REVIEWED,

	/** No check-in has happened, so there is no stay to review yet (or ever, if it ended otherwise). */
	NOT_COMPLETED,

	/** Checked in, but more than the review window ago — the verdict is frozen. */
	WINDOW_CLOSED,

	/** No booking answers to that code. Callers map this to the shared non-enumerating 404. */
	NO_SUCH_STAY
}
