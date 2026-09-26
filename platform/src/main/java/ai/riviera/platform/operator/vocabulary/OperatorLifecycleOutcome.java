package ai.riviera.platform.operator.vocabulary;

/**
 * How an admin-driven suspend (ACTIVE → SUSPENDED) or reinstate (SUSPENDED → ACTIVE) ended. A
 * typed outcome, not an exception: a wrong-status refusal is expected flow
 * ({@code riviera-java-conventions} §6).
 *
 * <p>{@link Changed} carries the username so the edge can revoke that operator's live sessions
 * without a second read after the status write. Rationale: RESPONSIBILITIES.md §operator.
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
