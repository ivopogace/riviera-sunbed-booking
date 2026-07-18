package ai.riviera.platform.operator.api;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.ApprovalOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.PendingOperator;

/**
 * Published port for the <strong>platform-admin</strong> operator-approval surface (#115, S6, design
 * D-5). Synchronous inbound queries/commands the edge admin controller calls → {@code api}, not
 * {@code spi}. It exposes the pending-registration list and the approve/reject state transitions; the
 * <em>role gate</em> (only an ADMIN may reach these) is enforced at the platform edge
 * ({@code SecurityConfig}, {@code /api/admin/**}), NOT in this module — this is a platform-wide admin
 * surface, exempt from the per-venue authorization of invariant #13.
 */
public interface OperatorApprovals {

	/** Every operator awaiting approval (status PENDING), oldest first. */
	List<PendingOperator> pending();

	/**
	 * Approve the PENDING operator with this id → ACTIVE (it can now sign in). Returns
	 * {@link ApprovalOutcome#APPROVED}; {@link ApprovalOutcome#NOT_PENDING} if it exists but is not
	 * PENDING; {@link ApprovalOutcome#NO_SUCH_OPERATOR} if there is no such operator.
	 */
	ApprovalOutcome approve(OperatorId operatorId);

	/**
	 * Reject the PENDING operator with this id → REJECTED (it still cannot sign in). Returns
	 * {@link ApprovalOutcome#REJECTED} / {@link ApprovalOutcome#NOT_PENDING} /
	 * {@link ApprovalOutcome#NO_SUCH_OPERATOR}, mirroring {@link #approve}.
	 */
	ApprovalOutcome reject(OperatorId operatorId);
}
