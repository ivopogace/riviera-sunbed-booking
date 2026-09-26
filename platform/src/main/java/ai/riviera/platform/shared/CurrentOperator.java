package ai.riviera.platform.shared;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Edge glue that resolves the authenticated principal to its {@link OperatorId}; {@code operator}
 * only maps a username to an id via {@link OperatorDirectory}. Venue-scoped controllers call
 * {@link #require} and pass the id to their application service, which performs the ownership check
 * (invariant #13). In {@code shared}, not the root, because modules depend on it (Rationale:
 * {@code RESPONSIBILITIES.md} § {@code shared}). A principal outside the may-operate set
 * ({@code ACTIVE} or {@code PENDING}) owns nothing → {@link AccessDeniedException} ({@code 403}).
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
