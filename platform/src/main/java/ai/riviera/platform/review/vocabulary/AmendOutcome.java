package ai.riviera.platform.review.vocabulary;

/**
 * What an amend to an existing review did — one outcome for both verbs, because editing and
 * deleting your own review are refused for exactly the same reasons; every member is reachable
 * for both. Sealed, so the driving adapter's {@code switch} is exhaustive without a
 * {@code default}.
 *
 * <p>Keep it apart from {@link SubmitOutcome}: submit's {@code AlreadyReviewed} only a first write
 * can hit, and would be a dead arm in every amend's switch.
 */
public sealed interface AmendOutcome {

	/** The review was rewritten or removed, and the venue's recompute was announced. */
	record Done() implements AmendOutcome {
	}

	/** No booking answers to that code. */
	record NoSuchStay() implements AmendOutcome {
	}

	/** The booking exists but was never checked in, so there is no delivered stay to amend. */
	record NotEligible() implements AmendOutcome {
	}

	/** Checked in longer than the review window ago — the verdict is frozen, edits included. */
	record WindowClosed() implements AmendOutcome {
	}

	/** The stay is amendable, but carries no review to amend — including a lost race with a delete. */
	record NoSuchReview() implements AmendOutcome {
	}

	/** A platform admin has hidden the review; it is frozen for its author until un-hidden. */
	record Hidden() implements AmendOutcome {
	}
}
