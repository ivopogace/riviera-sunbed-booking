package ai.riviera.platform.operator.vocabulary;

/**
 * How linking an external identity to an operator ended (#276). {@link Conflict} covers both an identity linked to
 * another operator and a second identity from one issuer, so the edge answers them alike and names no other account.
 */
public sealed interface SsoLinkOutcome
		permits SsoLinkOutcome.Linked, SsoLinkOutcome.Conflict, SsoLinkOutcome.NotOperable {

	/** The identity is linked to this operator, now or already. */
	record Linked() implements SsoLinkOutcome {
	}

	/** Nothing was written: the identity, or this operator's link for the issuer, is taken. */
	record Conflict() implements SsoLinkOutcome {
	}

	/** The operator is neither {@code ACTIVE} nor {@code PENDING}, or unknown; nothing was written. */
	record NotOperable() implements SsoLinkOutcome {
	}
}
