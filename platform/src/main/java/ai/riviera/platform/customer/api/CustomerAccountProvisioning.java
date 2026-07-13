package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

/**
 * Published write port that creates a customer account (S2, epic #108). The platform edge's register
 * endpoint encodes the password <strong>before</strong> calling this (the module receives an
 * already-encoded, opaque hash — exactly as {@code operator.api.OperatorProvisioning} does), so no
 * Spring Security type crosses into the {@code customer} module (RV-BE-11).
 *
 * <p>Registration is <strong>idempotent on the email</strong> and non-enumerating: a first
 * registration returns {@link RegistrationOutcome.Registered}; a repeat for the same normalized email
 * returns {@link RegistrationOutcome.AlreadyRegistered} without writing a second row or overwriting the
 * existing hash. Both outcomes map to the same outward HTTP response at the edge (design D-8).
 */
public interface CustomerAccountProvisioning {

	/** Create the account if the email is free; see {@link RegistrationOutcome} for the two cases. */
	RegistrationOutcome register(String email, String passwordHash);
}
