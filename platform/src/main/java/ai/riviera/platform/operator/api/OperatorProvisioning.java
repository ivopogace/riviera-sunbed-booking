package ai.riviera.platform.operator.api;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Published provisioning port for operator credentials (issue #74) — how a new operator gets an
 * account and how a password is rotated.
 *
 * <p><strong>Reachability has changed twice since #74's "no self-service HTTP endpoint" decision</strong>
 * (grill 2026-07-01), so that line no longer describes the system: <strong>#115</strong> made account
 * creation self-service via {@code POST /api/auth/operator/register} (into a {@code PENDING} account an
 * admin must approve), and <strong>#326</strong> made {@link #setPassword} self-service via
 * {@code POST /api/auth/operator/password} for an operator changing its <em>own</em> password after
 * proving the current one. What the original decision protected still holds and is worth stating
 * positively: no operator can provision or re-credential <em>another</em> account through this port, and
 * the bootstrap admin is excluded from the self-service path because its credential is env-managed
 * ({@code RIVIERA_OPERATOR_PASSWORD}, re-stamped every boot by the edge's credential initializer).
 *
 * <p>Both methods take an <strong>already-encoded</strong> credential hash: the edge encodes the raw
 * password with Spring Security's {@code PasswordEncoder} and passes the opaque result here, keeping
 * all crypto/Spring-Security out of the {@code operator} module (RV-BE-11). The module only stores it.
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
