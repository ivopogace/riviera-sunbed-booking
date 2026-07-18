package ai.riviera.platform.customer.vocabulary;

/**
 * The result of registering a customer account — a closed, caller-mappable set (typed outcomes for
 * expected flows, not exceptions; riviera-java-conventions). A sealed interface so the edge
 * {@code switch}es exhaustively. Both cases return the <em>identical</em> outward HTTP response
 * (non-enumeration, design D-8); the edge uses the distinction only to decide whether to establish a
 * session — a fresh {@link Registered} auto-signs-in, an {@link AlreadyRegistered} does not.
 */
public sealed interface RegistrationOutcome
		permits RegistrationOutcome.Registered, RegistrationOutcome.AlreadyRegistered {

	/** A new account was created; {@code accountId} is its generated identity. */
	record Registered(CustomerAccountId accountId) implements RegistrationOutcome {
	}

	/**
	 * An account already existed for this (normalized) email, so nothing was written and no hash was
	 * overwritten. Carries no payload — the edge must not leak that the email exists (D-8).
	 */
	record AlreadyRegistered() implements RegistrationOutcome {
	}
}
