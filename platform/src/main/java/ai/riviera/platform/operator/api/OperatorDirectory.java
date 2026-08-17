package ai.riviera.platform.operator.api;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Resolves an authenticated principal to its {@link OperatorId} (invariant #11 — a pure mapping
 * query owned by {@code operator}; it does <em>not</em> read the Spring Security context — that is
 * an edge concern the controllers handle, then hand the username here). Used by the venue-scoped
 * controllers to turn {@code authentication.getName()} into the id they pass to their service.
 *
 * <p>Login/credentials themselves are a platform/edge concern. This port only answers
 * "which operator is this username?", and only for the may-operate set ({@code ACTIVE} or
 * {@code PENDING} — approval gates tourist visibility, not console access).
 */
public interface OperatorDirectory {

	/**
	 * The id of the operator with this username when its status is in the may-operate set
	 * ({@code ACTIVE} or {@code PENDING}), or empty if none. A suspended, rejected, or unknown
	 * principal therefore owns nothing and is denied.
	 */
	Optional<OperatorId> operatorFor(String username);
}
