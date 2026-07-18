package ai.riviera.platform.operator.domain;

/**
 * Lifecycle of an operator account. A self-registered operator starts {@link #PENDING} (created but
 * unable to authenticate); a platform admin flips it to {@link #ACTIVE} (login enabled) or
 * {@link #REJECTED} (terminal). Only an {@code ACTIVE} account resolves to an {@code OperatorId} and
 * can own venues; every other status is treated as owning nothing and cannot log in (the edge builds a
 * disabled principal). A {@link #SUSPENDED} account is an ACTIVE one later disabled. The tokens are kept
 * in lockstep with the {@code operator_status_check} constraint (widened in
 * {@code V29__operator_registration_approval_and_retire_owns_all.sql}) — invariant #6a, no magic
 * status strings.
 */
public enum OperatorStatus {
	PENDING,
	ACTIVE,
	SUSPENDED,
	REJECTED
}
