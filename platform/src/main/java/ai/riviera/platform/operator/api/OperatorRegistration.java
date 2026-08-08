package ai.riviera.platform.operator.api;

import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;

/**
 * Published write port for operator <strong>self-registration</strong>. The platform edge
 * encodes the password BEFORE calling this (the module receives an already-encoded, opaque hash —
 * exactly as {@link OperatorProvisioning} does), so no Spring Security type crosses into the
 * {@code operator} module (RV-BE-11). A synchronous inbound command the edge calls → {@code api}, not
 * {@code spi}.
 *
 * <p>Registration creates a {@code PENDING} account that <strong>cannot authenticate</strong> until a
 * platform admin approves it (design D-5; only an {@code ACTIVE} account resolves to an id / can log
 * in). It is idempotent + non-enumerating on the username: a first registration returns
 * {@link OperatorRegistrationOutcome.Registered}; a repeat for the same username returns
 * {@link OperatorRegistrationOutcome.AlreadyRegistered} without writing a second row or overwriting the
 * existing hash. Both outcomes map to the same outward HTTP response at the edge (design D-8).
 */
public interface OperatorRegistration {

	/**
	 * Create a {@code PENDING} operator if the username is free. The pre-encoded {@code passwordHash} is
	 * stored opaquely; {@code contactEmail} is informational — for the admin's approval decision, not a
	 * login key, not unique, not verified. See {@link OperatorRegistrationOutcome} for the two cases.
	 */
	OperatorRegistrationOutcome register(String username, String passwordHash, String contactEmail);
}
