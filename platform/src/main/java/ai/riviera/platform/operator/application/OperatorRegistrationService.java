package ai.riviera.platform.operator.application;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorLifecycle;
import ai.riviera.platform.operator.api.OperatorRegistration;
import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * Application service for operator self-registration and the admin-driven lifecycle (approve,
 * reject, suspend, reinstate), package-private behind {@link OperatorRegistration} /
 * {@link OperatorLifecycle} (invariant #11). It owns the state transitions only; the login
 * machinery, the {@code ROLE_ADMIN} mapping and the role gate stay at the platform edge
 * (RV-BE-11, {@code OperatorAuthPlacementTests}).
 */
@Service
class OperatorRegistrationService implements OperatorRegistration, OperatorLifecycle {

	private final Operators operators;

	OperatorRegistrationService(Operators operators) {
		this.operators = operators;
	}

	@Override
	@Transactional
	public OperatorRegistrationOutcome register(String username, String passwordHash, String contactEmail) {
		return operators.insertPending(username, passwordHash, contactEmail);
	}

	@Override
	@Transactional(readOnly = true)
	public List<PendingOperator> pending() {
		return operators.pendingOperators();
	}

	@Override
	@Transactional
	public ApprovalOutcome approve(OperatorId operatorId) {
		return operators.activate(operatorId);
	}

	@Override
	@Transactional
	public ApprovalOutcome reject(OperatorId operatorId) {
		return operators.rejectPending(operatorId);
	}

	@Override
	@Transactional(readOnly = true)
	public List<OperatorAccount> accounts() {
		return operators.accounts();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<String> usernameInStatus(OperatorId operatorId, OperatorStatus expected) {
		return operators.usernameByIdInStatus(operatorId, expected);
	}

	@Override
	@Transactional
	public OperatorLifecycleOutcome suspend(OperatorId operatorId) {
		return operators.suspend(operatorId);
	}

	@Override
	@Transactional
	public OperatorLifecycleOutcome reinstate(OperatorId operatorId) {
		return operators.reinstate(operatorId);
	}
}
