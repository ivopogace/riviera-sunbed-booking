package ai.riviera.platform;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Edge glue that resolves the authenticated principal to its {@link OperatorId} (issue #73). This
 * is a platform/edge concern (reading the Spring Security context is <em>not</em> {@code operator}
 * domain — {@code operator} only maps a username to an id via {@link OperatorDirectory}), so it
 * lives in the application root alongside {@code SecurityConfig}, not inside any module. The
 * venue-scoped controllers call {@link #require} and pass the id to their application service,
 * which performs the actual ownership check (invariant #13).
 *
 * <p>An authenticated principal with no {@code ACTIVE} operator account owns nothing →
 * {@link AccessDeniedException} (mapped to {@code 403} by {@link VenueAuthorizationExceptionHandler}).
 * In the interim the only login is the shared {@code operator} user, which resolves to the bootstrap
 * operator; per-operator identity arrives with #74.
 */
@Component
public class CurrentOperator {

	private final OperatorDirectory directory;

	CurrentOperator(OperatorDirectory directory) {
		this.directory = directory;
	}

	/** The current operator's id, or {@link AccessDeniedException} (→ 403) if the principal maps to none. */
	public OperatorId require(Authentication authentication) {
		String username = authentication != null ? authentication.getName() : null;
		if (username == null) {
			throw new AccessDeniedException("no authenticated operator");
		}
		return directory.operatorFor(username)
				.orElseThrow(() -> new AccessDeniedException("principal is not an active operator"));
	}
}
