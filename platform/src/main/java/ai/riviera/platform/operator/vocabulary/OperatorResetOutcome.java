package ai.riviera.platform.operator.vocabulary;

/**
 * How redeeming an operator's password-reset token ended (#1737). Unknown, expired, used, retired and a
 * no-longer-{@code ACTIVE} operator's tokens are one {@link InvalidOrExpired}, so the edge answers them
 * identically. {@link Reset} names the principal whose sessions the edge revokes.
 */
public sealed interface OperatorResetOutcome
		permits OperatorResetOutcome.Reset, OperatorResetOutcome.InvalidOrExpired {

	/** The token is consumed and the new hash stored for {@code username}. */
	record Reset(String username) implements OperatorResetOutcome {
	}

	/** Nothing was written. */
	record InvalidOrExpired() implements OperatorResetOutcome {
	}
}
