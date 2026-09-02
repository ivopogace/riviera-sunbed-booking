package ai.riviera.platform.review.vocabulary;

/**
 * What a platform admin's takedown, or its reversal, did to one review. Both verbs are idempotent:
 * repeating one is {@link AlreadyApplied}, an ordinary answer rather than a refusal, so a retried
 * request or a double press changes nothing and announces nothing twice.
 *
 * <p>Sealed, so the driving adapter's {@code switch} is exhaustive without a {@code default}.
 */
public sealed interface ModerationOutcome {

	/** The review changed state, and the venue's recompute was announced. */
	record Applied() implements ModerationOutcome {
	}

	/** The review was already in the requested state; nothing changed and nothing was announced. */
	record AlreadyApplied() implements ModerationOutcome {
	}

	/** No review answers to that id. */
	record NoSuchReview() implements ModerationOutcome {
	}
}
