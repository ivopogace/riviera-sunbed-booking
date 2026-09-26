package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Published read port that resolves a customer account's login email to its {@link CustomerAccountId}.
 * The platform edge's {@code CurrentCustomer} calls this to turn an authenticated {@code CUSTOMER}
 * principal (named by its email) into the account id a signed-in booking is linked to. Kept apart
 * from the credential port {@link CustomerAccounts}: each stays single-purpose (#11, RV-BE-11).
 *
 * <p>The module normalizes {@code email} (trimmed + lower-cased) like the registration key, so
 * callers may pass the raw principal name.
 */
public interface CustomerAccountDirectory {

	/** The account id for this email, or empty if no customer account exists for it. */
	Optional<CustomerAccountId> accountFor(String email);
}
