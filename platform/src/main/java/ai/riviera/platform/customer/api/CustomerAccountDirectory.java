package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Published read port that resolves a customer account's login email to its {@link CustomerAccountId}.
 * The platform edge's {@code CurrentCustomer} calls this to turn an authenticated
 * {@code CUSTOMER} principal (whose name is the email) into the technical account id that a signed-in
 * booking is linked to. Identity resolution — the account-side twin of {@code operator.api.OperatorDirectory}
 * ({@code operatorFor(username) -> OperatorId}) — deliberately kept separate from the credential port
 * {@link CustomerAccounts} (email + hash): authentication and identity-resolution are different
 * conversations, so each stays a single-purpose port (invariant #11, RV-BE-11).
 *
 * <p>The {@code email} is normalized (trimmed + lower-cased) by the module before lookup, matching the
 * registration key, so callers may pass the raw principal name. Returns empty when no account exists
 * for the email.
 */
public interface CustomerAccountDirectory {

	/** The account id for this email, or empty if no customer account exists for it. */
	Optional<CustomerAccountId> accountFor(String email);
}
