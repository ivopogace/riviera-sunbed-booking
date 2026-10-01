package ai.riviera.platform.customer.api;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;

/**
 * Published read port for a customer account's stored credential: {@code auth} builds its Spring Security
 * principals from it and re-reads the live account on every request. The module owns credential <em>storage</em>
 * only; it does <strong>not</strong> encode or verify the hash (RV-BE-11; Rationale: {@code RESPONSIBILITIES.md}
 * §customer). Emails are normalized (lower-cased + trimmed) before lookup, so callers may pass them as typed.
 */
public interface CustomerAccounts {

	/** The stored password credential for this email, or empty if no account or no local password (SSO-only). */
	Optional<CustomerAccountCredential> findByEmail(String email);

	/** The live account with this email, SSO-only included (null hash), or empty once it is gone or erased. */
	Optional<LiveAccountCredential> liveCredential(String email);

	/** The live account with this id, under its stored email, or empty once it is gone or erased. */
	Optional<LiveAccountCredential> liveCredential(CustomerAccountId accountId);
}
