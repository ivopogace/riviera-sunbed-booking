package ai.riviera.platform.operator.application;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.OperatorProvisioning;

/**
 * The {@code operator} module's credential application service (issue #74): the read side of an
 * account's stored credential ({@link OperatorAccounts}) and the provisioning/rotation write side
 * ({@link OperatorProvisioning}). Package-private behind the published ports (invariant #11);
 * constructor injection into a {@code final} {@link Operators}. Kept separate from
 * {@link OperatorService} (the authorization/ownership reads) so credential concerns don't bloat the
 * ownership service.
 *
 * <p>It holds <strong>no</strong> Spring Security type: the stored {@code passwordHash} is an opaque
 * blob supplied already-encoded by the edge, and this service never encodes or verifies it. That
 * keeps the password-checking machinery at the platform edge (RV-BE-11, {@code RESPONSIBILITIES.md}).
 * The writes are {@code @Transactional}; the read is a pure query.
 */
@Service
class OperatorAccountService implements OperatorAccounts, OperatorProvisioning {

	private final Operators operators;

	OperatorAccountService(Operators operators) {
		this.operators = operators;
	}

	@Override
	public Optional<OperatorCredential> findByUsername(String username) {
		return operators.credentialByUsername(username);
	}

	@Override
	@Transactional
	public OperatorId provision(String username, String passwordHash) {
		return operators.insert(username, passwordHash);
	}

	@Override
	@Transactional
	public boolean setPassword(String username, String passwordHash) {
		return operators.updatePassword(username, passwordHash) > 0;
	}
}
