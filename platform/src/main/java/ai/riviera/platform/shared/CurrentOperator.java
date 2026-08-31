package ai.riviera.platform.shared;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Edge glue that resolves the authenticated principal to its {@link OperatorId}. This
 * is a platform/edge concern (reading the Spring Security context is <em>not</em> {@code operator}
 * domain — {@code operator} only maps a username to an id via {@link OperatorDirectory}), so it
 * lives in the {@code shared} kernel module, not at the composition root: modules depend
 * on it, so hosting it at the root would cycle back through them. The
 * venue-scoped controllers call {@link #require} and pass the id to their application service,
 * which performs the actual ownership check (invariant #13).
 *
 * <p>An authenticated principal outside the may-operate set ({@code ACTIVE} or {@code PENDING})
 * owns nothing → {@link AccessDeniedException} (mapped to {@code 403} by the root
 * {@code ApiErrorHandler} advice).
 */
@Component
public class CurrentOperator {

	private final OperatorDirectory directory;

	public CurrentOperator(OperatorDirectory directory) {
		this.directory = directory;
	}

	/** The current operator's id, or {@link AccessDeniedException} (→ 403) if the principal maps to none. */
	public OperatorId require(Authentication authentication) {
		String username = authentication != null ? authentication.getName() : null;
		if (username == null) {
			throw new AccessDeniedException("no authenticated operator");
		}
		return directory.operatorFor(username)
				.orElseThrow(() -> new AccessDeniedException("principal resolves to no operable operator"));
	}
}
