package ai.riviera.platform.operator.api;

import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Resolves an authenticated principal's username to its {@link OperatorId} (invariant #11): a pure
 * mapping query. Reading the Spring Security context stays with the edge controllers, which hand
 * the username here and pass the id to their venue-scoped service.
 *
 * <p>Answers only for the may-operate set ({@code ACTIVE} or {@code PENDING} — approval gates
 * tourist visibility, not console access). Login and credentials are edge concerns.
 */
public interface OperatorDirectory {

	/**
	 * The id of the operator with this username when its status is in the may-operate set
	 * ({@code ACTIVE} or {@code PENDING}), or empty if none. A suspended, rejected, or unknown
	 * principal therefore owns nothing and is denied.
	 */
	Optional<OperatorId> operatorFor(String username);
}
