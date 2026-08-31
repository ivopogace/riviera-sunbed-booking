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
 * Published port for the <strong>platform-admin</strong> operator account-lifecycle surface (design D-5).
 * Synchronous inbound queries/commands the edge admin controller calls
 * → {@code api}, not {@code spi}. It exposes the two admin work queues (registrations awaiting
 * approval, currently-active operators) and every admin-driven status transition:
 * {@code PENDING → ACTIVE/REJECTED} (approve/reject) and {@code ACTIVE ⇄ SUSPENDED}
 * (suspend/reinstate).
 *
 * <p>Renamed from {@code OperatorApprovals} in #128: with suspension added, "approvals" no longer
 * names the conversation this port holds. It is deliberately <em>one</em> port rather than a second
 * narrow one — admin-driven account lifecycle is a single purposeful conversation.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> These endpoints live under {@code /api/admin/**}
 * and are gated to the {@code ADMIN} role in {@code SecurityConfig} — a platform-wide admin action,
 * exempt from the per-venue authorization of invariant #13. The <em>role gate</em>, the
 * <em>self-suspend refusal</em> (it needs the authenticated principal, which is edge knowledge) and
 * the <em>session revocation</em> that follows a suspension are all platform-edge machinery
 * (RV-BE-11) — this module owns the state transitions and nothing else.
 */
public interface OperatorLifecycle {

	/** Every operator awaiting approval (status PENDING), oldest first. */
	List<PendingOperator> pending();

	/** Every operator that can currently authenticate (status ACTIVE), by username. */
	List<OperatorAccount> accounts();

	/**
	 * The username of the operator with this id when it is in {@code expected} status, or empty
	 * (unknown or in any other status).
	 *
	 * <p>A pure query that exists for one reason: a session-revoking transition ({@link #suspend},
	 * {@link #reject}) can only name the principal <em>after</em> it has committed, so the edge could
	 * revoke that operator's sessions only afterwards — and a transient revoke failure then left the
	 * account's sessions alive while the admin's retry drew a wrong-status refusal. Knowing the
	 * username up front lets the edge revoke first, so a failure there leaves the account in its
	 * prior status and the retry does both. The {@code expected} guard keeps the pre-read as precise
	 * as the transition it precedes — a wrong-status target revokes nothing.
	 */
	Optional<String> usernameInStatus(OperatorId operatorId, OperatorStatus expected);

	/**
	 * Approve the PENDING operator with this id → ACTIVE (it can now sign in). Returns
	 * {@link ApprovalOutcome.Approved}, carrying the operator's registered contact email so the caller
	 * can tell it the account is live — populated only when <em>this</em> call performed the
	 * transition, so a concurrent second approval cannot notify twice;
	 * {@link ApprovalOutcome.NotPending} if it exists but is not PENDING;
	 * {@link ApprovalOutcome.NoSuchOperator} if there is no such operator.
	 */
	ApprovalOutcome approve(OperatorId operatorId);

	/**
	 * Reject the PENDING operator with this id → REJECTED (it can no longer sign in). Returns
	 * {@link ApprovalOutcome.Rejected} carrying the username — a PENDING operator can hold a live
	 * session, so the caller must revoke it — / {@link ApprovalOutcome.NotPending} /
	 * {@link ApprovalOutcome.NoSuchOperator}, mirroring {@link #approve} — but note the asymmetry:
	 * a rejection carries no address, because this slice deliberately sends the applicant nothing.
	 */
	ApprovalOutcome reject(OperatorId operatorId);

	/**
	 * Suspend the ACTIVE operator with this id → SUSPENDED: it can no longer authenticate, and — since
	 * ownership resolution is ACTIVE-only — it owns nothing until reinstated. Returns
	 * {@link OperatorLifecycleOutcome.Changed} carrying the username, so the caller can revoke that
	 * principal's live sessions; {@link OperatorLifecycleOutcome.WrongStatus} if it is not ACTIVE;
	 * {@link OperatorLifecycleOutcome.NoSuchOperator} if there is no such operator.
	 *
	 * <p>Reversible by {@link #reinstate} — suspension deliberately leaves the operator's venue
	 * ownership rows in place, so reinstating restores exactly what was suspended.
	 */
	OperatorLifecycleOutcome suspend(OperatorId operatorId);

	/**
	 * Reinstate the SUSPENDED operator with this id → ACTIVE (it can sign in again, and owns its
	 * venues again). Returns the same three outcomes as {@link #suspend}, with
	 * {@link OperatorLifecycleOutcome.WrongStatus} when the operator is not SUSPENDED.
	 */
	OperatorLifecycleOutcome reinstate(OperatorId operatorId);
}
