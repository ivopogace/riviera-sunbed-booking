package ai.riviera.platform.customer.api;

import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

/**
 * Published write port that creates a customer account. The platform edge's register endpoint
 * encodes the password <strong>before</strong> calling this, so the module receives an opaque hash
 * and no Spring Security type crosses into the {@code customer} module (RV-BE-11).
 *
 * <p>Registration is <strong>idempotent on the email</strong> and non-enumerating: a repeat for the
 * same normalized email returns {@link RegistrationOutcome.AlreadyRegistered} without writing a row
 * or overwriting the hash; both outcomes map to the same HTTP response at the edge (design D-8).
 */
public interface CustomerAccountProvisioning {

	/** Create the account if the email is free; see {@link RegistrationOutcome} for the two cases. */
	RegistrationOutcome register(String email, String passwordHash);
}
