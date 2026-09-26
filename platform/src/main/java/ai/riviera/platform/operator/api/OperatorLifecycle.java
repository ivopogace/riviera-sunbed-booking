package ai.riviera.platform.operator.api;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorAccount;
import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorLifecycleOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * Platform-admin port for operator account lifecycle: the two admin work queues (pending registrations,
 * active accounts) and every admin transition — {@code PENDING → ACTIVE/REJECTED} (approve/reject) and
 * {@code ACTIVE ⇄ SUSPENDED} (suspend/reinstate). Role-gated under {@code /api/admin/**}, not venue-scoped
 * (exempt from invariant #13). The role gate, self-suspend refusal and session revocation are platform-edge
 * machinery; this module owns only the state transitions (RESPONSIBILITIES.md §operator).
 */
public interface OperatorLifecycle {

	/** Every operator awaiting approval (status PENDING), oldest first. */
	List<PendingOperator> pending();

	/** Every decided operator (status ACTIVE or SUSPENDED), by username, for the admin console. */
	List<OperatorAccount> accounts();

	/**
	 * The username of this operator if it is in {@code expected} status, else empty. Lets the edge revoke
	 * sessions <em>before</em> a session-revoking transition ({@link #suspend}, {@link #reject}) commits, so a
	 * revoke failure leaves the prior status for the retry (RESPONSIBILITIES.md §operator).
	 */
	Optional<String> usernameInStatus(OperatorId operatorId, OperatorStatus expected);

	/**
	 * PENDING → ACTIVE: {@link ApprovalOutcome.Approved} with the contact email only when <em>this</em> call
	 * performed the transition (a concurrent second approval cannot notify twice);
	 * {@link ApprovalOutcome.NotPending} or {@link ApprovalOutcome.NoSuchOperator} otherwise.
	 */
	ApprovalOutcome approve(OperatorId operatorId);

	/**
	 * PENDING → REJECTED: {@link ApprovalOutcome.Rejected} carrying the username (a PENDING operator can hold a
	 * live session the caller must revoke) but no address — the applicant is sent nothing. Otherwise the same
	 * refusals as {@link #approve}.
	 */
	ApprovalOutcome reject(OperatorId operatorId);

	/**
	 * ACTIVE → SUSPENDED: cannot authenticate and owns nothing until {@link #reinstate} (ownership rows are
	 * kept). {@link OperatorLifecycleOutcome.Changed} carries the username for session revocation; otherwise
	 * {@link OperatorLifecycleOutcome.WrongStatus} or {@link OperatorLifecycleOutcome.NoSuchOperator}.
	 */
	OperatorLifecycleOutcome suspend(OperatorId operatorId);

	/**
	 * Reinstate the SUSPENDED operator with this id → ACTIVE (it can sign in again, and owns its
	 * venues again). Returns the same three outcomes as {@link #suspend}, with
	 * {@link OperatorLifecycleOutcome.WrongStatus} when the operator is not SUSPENDED.
	 */
	OperatorLifecycleOutcome reinstate(OperatorId operatorId);
}
