package ai.riviera.platform.operator.api;

/**
 * Published provisioning port for operator credentials (issue #74) — how a new operator gets an
 * account and how a password is rotated, driven programmatically (the boot provisioner for the
 * bootstrap operator; a future admin console for the rest). There is deliberately <strong>no</strong>
 * self-service HTTP endpoint: provisioning is not an operator-reachable surface (maintainer decision,
 * grill 2026-07-01).
 *
 * <p>Both methods take an <strong>already-encoded</strong> credential hash: the edge encodes the raw
 * password with Spring Security's {@code PasswordEncoder} and passes the opaque result here, keeping
 * all crypto/Spring-Security out of the {@code operator} module (RV-BE-11). The module only stores it.
 */
public interface OperatorProvisioning {

	/**
	 * Create a new {@code ACTIVE} operator (not owns-all) with this username and pre-encoded
	 * credential hash; returns its {@link OperatorId}. Fails if the username already exists (the
	 * {@code operator.username} unique constraint).
	 */
	OperatorId provision(String username, String passwordHash);

	/**
	 * Set/rotate the stored credential of the existing operator with this username to the given
	 * pre-encoded hash. Returns {@code true} if a row was updated, {@code false} if no such operator
	 * exists (no row is created — use {@link #provision} for that).
	 */
	boolean setPassword(String username, String passwordHash);
}
