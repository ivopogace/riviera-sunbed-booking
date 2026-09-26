package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;

/**
 * Published read port for a customer account's stored credential; the platform edge's customer
 * {@code UserDetailsService} calls this to build a Spring Security principal from the DB. The
 * module owns credential <em>storage</em> only: it does <strong>not</strong> encode or verify the
 * hash, which is the edge's job (RV-BE-11; Rationale: {@code RESPONSIBILITIES.md} §customer).
 *
 * <p>The {@code email} is normalized (lower-cased + trimmed) by the module before lookup, so callers
 * may pass it as typed. Returns empty when no account exists for the email.
 */
public interface CustomerAccounts {

	/** The stored credential for this email, or empty if no such account exists. */
	Optional<CustomerAccountCredential> findByEmail(String email);
}
