package ai.riviera.platform.operator.vocabulary;

/**
 * Lifecycle of an operator account, stored as its token on the {@code operator} row. A
 * self-registered operator starts {@link #PENDING}; a platform admin flips it to {@link #ACTIVE} or
 * {@link #REJECTED} (terminal), and may later toggle {@code ACTIVE} ⇄ {@link #SUSPENDED}. Published
 * so each status predicate lives with its owner: the edge's may-authenticate set, the module's
 * ownership resolution ({@code OperatorDirectory}), and tourist visibility ({@code VenueVisibility},
 * ACTIVE-only). The tokens are kept in lockstep with the {@code operator_status_check} constraint
 * (invariant #6a, no magic status strings).
 */
public enum OperatorStatus {
	PENDING,
	ACTIVE,
	SUSPENDED,
	REJECTED
}
