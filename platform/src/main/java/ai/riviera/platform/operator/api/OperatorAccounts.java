package ai.riviera.platform.operator.api;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorCredential;

/**
 * Published read port for an operator account's stored credential: the edge's
 * {@code UserDetailsService} builds its Spring Security principal from it. The module owns the
 * credential storage only; encoding and verifying the hash is edge machinery (RV-BE-11).
 *
 * <p>Returns an account regardless of status (carrying its status token) so the edge can apply its
 * may-authenticate set in the pre-auth check; empty only for an unknown username. Ownership
 * resolution (username → {@code OperatorId}) is {@link OperatorDirectory}'s.
 */
public interface OperatorAccounts {

	/** The stored credential for this username, or empty if no such operator row exists. */
	Optional<OperatorCredential> findByUsername(String username);
}
