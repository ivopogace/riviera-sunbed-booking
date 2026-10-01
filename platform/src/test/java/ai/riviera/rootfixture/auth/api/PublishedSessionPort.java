package ai.riviera.rootfixture.auth.api;

/**
 * Stands in for {@code auth.api.SessionCredentials}: a module's <em>published</em> surface. The root may
 * not reach even this, so the rule must reject a root class that does.
 */
public interface PublishedSessionPort {

	boolean isCurrent(String principalName);
}
