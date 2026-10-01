package ai.riviera.rootfixture.auth.api;

/**
 * Stands in for {@code auth.api.SessionCredentials} — a published surface the composition root is allowed
 * to reach. The control case: a rule that rejected everything would pass its negative proof while being
 * useless.
 */
public interface GrantedSessionPort {

	boolean isCurrent(String principalName);
}
