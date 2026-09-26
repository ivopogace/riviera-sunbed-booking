package ai.riviera.platform.operator.api;

import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;

/**
 * Operator self-registration. The edge encodes the password first, so the module stores an opaque
 * hash (as {@link OperatorProvisioning} does) and no Spring Security type crosses in (RV-BE-11).
 * The account starts {@code PENDING}: it may sign in, but is not tourist-visible until approved.
 * Idempotent and non-enumerating on the username: a repeat returns
 * {@link OperatorRegistrationOutcome.AlreadyRegistered} without writing or overwriting the hash,
 * and the edge answers it exactly as {@link OperatorRegistrationOutcome.Registered} (D-8).
 */
public interface OperatorRegistration {

	/**
	 * Create a {@code PENDING} operator if the username is free. The pre-encoded {@code passwordHash} is
	 * stored opaquely; {@code contactEmail} is informational — for the admin's approval decision, not a
	 * login key, not unique, not verified. See {@link OperatorRegistrationOutcome} for the two cases.
	 */
	OperatorRegistrationOutcome register(String username, String passwordHash, String contactEmail);
}
