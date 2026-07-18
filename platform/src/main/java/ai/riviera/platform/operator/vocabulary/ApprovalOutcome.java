package ai.riviera.platform.operator.vocabulary;

/**
 * The result of an admin approve/reject decision on a self-registered operator (#115, S6) — a closed,
 * caller-mappable set (typed outcome over exceptions; riviera-java-conventions), so the edge admin
 * controller maps each case to an HTTP status exhaustively.
 */
public enum ApprovalOutcome {
	/** The PENDING operator was transitioned to ACTIVE (approve) — it can now sign in. */
	APPROVED,
	/** The PENDING operator was transitioned to REJECTED (reject) — it still cannot sign in. */
	REJECTED,
	/** The operator exists but is not PENDING (already ACTIVE/REJECTED/SUSPENDED) → the edge maps to 409. */
	NOT_PENDING,
	/** No operator has this id → the edge maps to 404. */
	NO_SUCH_OPERATOR
}
