package ai.riviera.platform.operator.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorRegistration;
import ai.riviera.platform.operator.vocabulary.OperatorRegistrationOutcome;

/**
 * Application service for operator self-registration + admin approval (#115, S6). Package-private
 * behind the published {@link OperatorRegistration} port (invariant #11); constructor injection into
 * the {@code final} {@link Operators} driven port. A self-registered operator is created {@code PENDING}
 * and cannot authenticate until a platform admin approves it (D-5) — this service owns the registration
 * and approval <em>state transitions</em>; the login machinery + the role gate stay at the platform
 * edge (RV-BE-11, {@code OperatorAuthPlacementTests}).
 */
@Service
class OperatorRegistrationService implements OperatorRegistration {

	private final Operators operators;

	OperatorRegistrationService(Operators operators) {
		this.operators = operators;
	}

	@Override
	@Transactional
	public OperatorRegistrationOutcome register(String username, String passwordHash, String contactEmail) {
		return operators.insertPending(username, passwordHash, contactEmail);
	}
}
