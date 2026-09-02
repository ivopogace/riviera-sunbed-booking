package ai.riviera.platform.review.domain;

/**
 * Where a stay stands against the review fences — {@link ReviewGate}'s verdict, and internal to
 * this module. It says which fence answered; what a caller is then handed is
 * {@link ai.riviera.platform.review.vocabulary.ReviewPanel}, which carries the data each state
 * actually has.
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

	/** A platform admin has taken the review out of public view; its author may read it, not change it. */
	HIDDEN,

	/** No booking answers to that code. Callers map this to the shared non-enumerating 404. */
	NO_SUCH_STAY
}
