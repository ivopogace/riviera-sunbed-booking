package ai.riviera.platform.operator.api;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Published provisioning port for operator credentials: direct account creation and password
 * rotation. {@link #setPassword} is also self-service ({@code POST /api/auth/operator/password})
 * for an operator's <em>own</em> password after proving the current one; no operator can provision
 * or re-credential <em>another</em> account here, and the bootstrap admin (credential env-managed,
 * {@code RIVIERA_OPERATOR_PASSWORD}) is excluded from self-service. Both methods take an
 * already-encoded hash from the edge, keeping crypto out of this module (RV-BE-11).
 */
public interface OperatorProvisioning {

	/**
	 * Create a new {@code ACTIVE} per-venue operator (owns no venue until one is granted; not an
	 * admin) with this username and pre-encoded credential hash; returns its {@link OperatorId}. Fails
	 * if the username already exists (the {@code operator.username} unique constraint).
	 */
	OperatorId provision(String username, String passwordHash);

	/**
	 * Set/rotate the stored credential of the existing operator with this username to the given
	 * pre-encoded hash. Returns {@code true} if a row was updated, {@code false} if no such operator
	 * exists (no row is created — use {@link #provision} for that).
	 */
	boolean setPassword(String username, String passwordHash);
}
