package ai.riviera.platform.operator.vocabulary;

/**
 * Lifecycle of an operator account, stored as its token on the {@code operator} row. A
 * self-registered operator starts {@link #PENDING}; an admin flips it to {@link #ACTIVE} or
 * {@link #REJECTED} (terminal), and may later toggle {@code ACTIVE} ⇄ {@link #SUSPENDED}. Published
 * so each status predicate lives with its owner: the edge's may-authenticate set, ownership
 * resolution ({@code OperatorDirectory}), tourist visibility ({@code VenueVisibility}, ACTIVE
 * only). Tokens match {@code operator_status_check} ({@code riviera-java-conventions} §6a).
 */
public enum OperatorStatus {
	PENDING,
	ACTIVE,
	SUSPENDED,
	REJECTED
}
