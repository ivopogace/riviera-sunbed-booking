package ai.riviera.platform.operator.api;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorCredential;

/**
 * Published read port for an operator account's stored credential. The platform edge's
 * {@code UserDetailsService} calls this to build a Spring Security principal from the DB — replacing
 * the old single in-memory {@code operator} user. The {@code operator} module owns the credential
 * <em>storage</em> (account identity); it does <strong>not</strong> encode or verify the hash — that
 * is the edge's password-checking machinery (RV-BE-11, {@code RESPONSIBILITIES.md}).
 *
 * <p>Returns an account <em>regardless of status</em> (carrying its lifecycle status token) so the
 * edge can apply its may-authenticate set via the framework's pre-auth check, and empty only when no
 * such username exists. Distinct from {@link OperatorDirectory}, which answers the
 * ownership-resolution question (username → {@link OperatorId}).
 */
public interface OperatorAccounts {

	/** The stored credential for this username, or empty if no such operator row exists. */
	Optional<OperatorCredential> findByUsername(String username);
}
