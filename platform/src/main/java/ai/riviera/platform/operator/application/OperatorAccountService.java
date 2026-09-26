package ai.riviera.platform.operator.application;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.OperatorProvisioning;

/**
 * Credential application service: the read side of an account's stored credential
 * ({@link OperatorAccounts}) and the provisioning/rotation write side
 * ({@link OperatorProvisioning}), package-private behind those ports (invariant #11) and kept apart
 * from {@link OperatorService}'s ownership reads. It holds no Spring Security type: the
 * {@code passwordHash} arrives already encoded and is never encoded or verified here (RV-BE-11).
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
