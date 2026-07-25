package ai.riviera.platform.operator.vocabulary;

/**
 * How an admin-driven operator lifecycle transition ended (#128) — suspend (ACTIVE → SUSPENDED) or
 * reinstate (SUSPENDED → ACTIVE). A typed outcome rather than an exception: a transition refused
 * because the account is in the wrong status is expected flow, not an exceptional condition
 * ({@code riviera-java-conventions} §6).
 *
 * <p>{@link Changed} carries the operator's <strong>username</strong> because the caller — the
 * platform edge — needs the principal name to revoke that operator's live sessions, and asking the
 * module a second time would open a window between the status write and the revocation. This mirrors
 * the shipped {@code ResetPasswordOutcome.Reset(accountId, email)} on the customer side. Publishing
 * the username across the seam is not new: {@link PendingOperator} already does.
 */
public sealed interface OperatorLifecycleOutcome
		permits OperatorLifecycleOutcome.Changed, OperatorLifecycleOutcome.WrongStatus,
		OperatorLifecycleOutcome.NoSuchOperator {

	/** The transition happened; {@code username} is the principal name whose sessions the edge revokes. */
	record Changed(OperatorId operatorId, String username) implements OperatorLifecycleOutcome {
	}

	/** The operator exists but was not in the status the transition requires → the edge maps to 409. */
	record WrongStatus() implements OperatorLifecycleOutcome {
	}

	/** No operator with this id → the edge maps to 404. */
	record NoSuchOperator() implements OperatorLifecycleOutcome {
	}
}
