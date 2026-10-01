package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.NotSignedInCustomerException;

/**
 * Published read port that resolves a customer account's login email to its {@link CustomerAccountId}:
 * controllers turn the session principal (named by its email) into the account id a signed-in booking
 * or {@code /api/me} call acts for. The caller reads the security context and says whether the
 * principal holds the customer role; this module never sees a Spring Security type (RV-BE-11). Kept
 * apart from the credential port {@link CustomerAccounts}. Emails are normalized like the registration
 * key, so callers pass the raw principal name.
 */
public interface CustomerAccountDirectory {

	/** The account id for this email, or empty if no customer account exists for it. */
	Optional<CustomerAccountId> accountFor(String email);

	/**
	 * The signed-in customer's account id, or empty for a {@code null} name, a principal that is not a
	 * customer (guest checkout, an operator session) or one with no account. Never a request-supplied id (#13 posture).
	 */
	Optional<CustomerAccountId> signedInAccount(String principalName, boolean customerPrincipal);

	/** As {@link #signedInAccount}, or {@link NotSignedInCustomerException} (→ {@code 403}) when it is empty. */
	CustomerAccountId requireSignedInAccount(String principalName, boolean customerPrincipal);
}
