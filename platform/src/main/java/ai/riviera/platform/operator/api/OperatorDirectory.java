package ai.riviera.platform.operator.api;

import java.util.Optional;

/**
 * Resolves an authenticated principal to its {@link OperatorId} (invariant #11 — a pure mapping
 * query owned by {@code operator}; it does <em>not</em> read the Spring Security context — that is
 * an edge concern the controllers handle, then hand the username here). Used by the venue-scoped
 * controllers to turn {@code authentication.getName()} into the id they pass to their service.
 *
 * <p>Login/credentials themselves are a platform/edge concern (#74). This port only answers
 * "which operator is this username?", and only for an {@code ACTIVE} account.
 */
public interface OperatorDirectory {

	/**
	 * The id of the {@code ACTIVE} operator with this username, or empty if none (unknown or
	 * suspended). A suspended or unknown principal therefore owns nothing and is denied.
	 */
	Optional<OperatorId> operatorFor(String username);
}
