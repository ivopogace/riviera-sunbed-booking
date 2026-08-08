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
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * Application service for operator self-registration + the admin-driven account lifecycle (S6),
 * including the later-added suspend/reinstate. Package-private
 * behind the published {@link OperatorRegistration} / {@link OperatorLifecycle} ports (invariant #11);
 * constructor injection into the {@code final} {@link Operators} driven port. A self-registered operator
 * is created {@code PENDING} and cannot authenticate until a platform admin approves it (D-5) — this
 * service owns the registration and approval <em>state transitions</em>; the login machinery, the
 * {@code ROLE_ADMIN} mapping, and the role gate all stay at the platform edge (RV-BE-11,
 * {@code OperatorAuthPlacementTests}).
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
	public Optional<String> activeUsername(OperatorId operatorId) {
		return operators.activeUsernameById(operatorId);
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
