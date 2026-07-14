package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;

/**
 * Published read port for a customer account's stored credential (S2, epic #108). The platform edge's
 * customer {@code UserDetailsService} calls this to build a Spring Security principal from the DB. The
 * {@code customer} module owns the credential <em>storage</em> (account identity); it does
 * <strong>not</strong> encode or verify the hash — that is the edge's password-checking machinery
 * (RV-BE-11, {@code RESPONSIBILITIES.md}). Mirrors {@code operator.api.OperatorAccounts}.
 *
 * <p>The {@code email} is normalized (lower-cased + trimmed) by the module before lookup, so callers
 * may pass it as typed. Returns empty when no account exists for the email.
 */
public interface CustomerAccounts {

	/** The stored credential for this email, or empty if no such account exists. */
	Optional<CustomerAccountCredential> findByEmail(String email);
}
