package ai.riviera.platform.operator.domain;

/**
 * Lifecycle of an operator account. Only an {@link #ACTIVE} account resolves to an
 * {@code OperatorId} and can own venues; a {@link #SUSPENDED} one is treated as owning nothing
 * (denied everywhere). The tokens are kept in lockstep with the {@code operator_status_check}
 * constraint in {@code V16__operator.sql} (invariant #6a — no magic status strings).
 */
public enum OperatorStatus {
	ACTIVE,
	SUSPENDED
}
