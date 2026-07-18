package ai.riviera.platform.operator.vocabulary;

/**
 * The result of a self-registration attempt for an operator account (#115, S6) — a closed,
 * caller-mappable set (typed outcomes over exceptions; riviera-java-conventions). A sealed interface so
 * the edge {@code switch}es/pattern-matches exhaustively. Both cases return the <em>identical</em>
 * outward HTTP response (non-enumeration, design D-8); the edge uses the distinction only to run the
 * constant-time equalizer, never to leak whether the username was already taken.
 */
public sealed interface OperatorRegistrationOutcome
		permits OperatorRegistrationOutcome.Registered, OperatorRegistrationOutcome.AlreadyRegistered {

	/** A new {@code PENDING} operator was created; {@code operatorId} is its generated identity. */
	record Registered(OperatorId operatorId) implements OperatorRegistrationOutcome {
	}

	/**
	 * An operator already existed with this username, so nothing was written and no hash was
	 * overwritten. Carries no payload — the edge must not leak that the username exists (D-8).
	 */
	record AlreadyRegistered() implements OperatorRegistrationOutcome {
	}
}
