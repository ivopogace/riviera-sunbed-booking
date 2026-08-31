package ai.riviera.platform.review.vocabulary;

/**
 * What a review submission did — a typed outcome rather than an exception, because every rejection
 * here is expected flow the caller must map to its own contract (a lost uniqueness race included).
 *
 * <p>Sealed, so the driving adapter's {@code switch} over it is exhaustive without a {@code default}
 * and a future outcome cannot be silently dropped into an existing branch.
 */
public sealed interface SubmitOutcome {

	/** The review was recorded and the venue's recompute was announced. */
	record Submitted() implements SubmitOutcome {
	}

	/** This booking already had a review — the uniqueness guard rejected the claim. */
	record AlreadyReviewed() implements SubmitOutcome {
	}

	/** The booking exists but was never checked in, so there is no delivered stay to rate. */
	record NotEligible() implements SubmitOutcome {
	}

	/** Checked in longer than the review window ago. */
	record WindowClosed() implements SubmitOutcome {
	}

	/** No booking answers to that code. */
	record NoSuchStay() implements SubmitOutcome {
	}
}
