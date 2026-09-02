package ai.riviera.platform.review.vocabulary;

import java.time.Instant;

/**
 * The whole answer to "what should this stay's review section show?" — one sealed type whose
 * variants carry exactly the data their state has, so a caller pattern-matches instead of testing a
 * flag and then hoping the neighbouring fields are populated.
 *
 * <p>It draws the distinction a single enum could not: {@link Frozen} is a review that exists and
 * can still be read but no longer changed, while {@link WindowClosed} is a stay nobody ever rated
 * and now never will. The two need opposite words on screen.
 */
public sealed interface ReviewPanel {

	/** Checked in, inside the window, not yet rated — the submit path will accept. */
	record Eligible(Instant windowClosesAt) implements ReviewPanel {
	}

	/** Rated, and still inside the window: the guest may read, rewrite or remove their verdict. */
	record AlreadyReviewed(OwnReview review, Instant windowClosesAt) implements ReviewPanel {
	}

	/** Rated, and past the window: the verdict stands as written and is read-only. */
	record Frozen(OwnReview review) implements ReviewPanel {
	}

	/**
	 * Rated, then taken out of public view by a platform admin: the author may still read it, and it
	 * neither counts toward the venue nor can be changed or removed — whatever the window says.
	 */
	record Hidden(OwnReview review) implements ReviewPanel {
	}

	/** Never rated, and past the window — there is nothing to show and nothing left to write. */
	record WindowClosed() implements ReviewPanel {
	}

	/** No check-in has happened, so there is no stay to review yet (or ever, if it ended otherwise). */
	record NotCompleted() implements ReviewPanel {
	}

	/** No booking answers to that code. Callers map this to the shared non-enumerating 404. */
	record NoSuchStay() implements ReviewPanel {
	}
}
