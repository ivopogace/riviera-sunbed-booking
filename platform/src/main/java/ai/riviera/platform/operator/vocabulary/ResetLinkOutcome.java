package ai.riviera.platform.operator.vocabulary;

/**
 * How an admin's request for an operator's password-reset link ended (#1737): a typed outcome, since a
 * wrong-status refusal is expected flow ({@code riviera-java-conventions} §6). Only an {@code ACTIVE}
 * operator is issued a link; the edge maps {@link NotActive} to 409 and {@link NoSuchOperator} to 404.
 */
public sealed interface ResetLinkOutcome
		permits ResetLinkOutcome.Issued, ResetLinkOutcome.NotActive, ResetLinkOutcome.NoSuchOperator {

	/** The token digest is stored and every earlier link for this operator is retired. */
	record Issued() implements ResetLinkOutcome {
	}

	/** The operator exists but is not {@code ACTIVE}; nothing was stored. */
	record NotActive() implements ResetLinkOutcome {
	}

	/** No operator with this id. */
	record NoSuchOperator() implements ResetLinkOutcome {
	}
}
