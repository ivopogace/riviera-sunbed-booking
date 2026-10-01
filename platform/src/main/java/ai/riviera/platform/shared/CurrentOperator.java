package ai.riviera.platform.shared;

import java.util.Optional;

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

	/** The authority every operator principal carries, admins included. */
	static final String ROLE_OPERATOR = "ROLE_OPERATOR";
	/** The platform-admin authority, kept in step with {@code is_admin} by the edge's session filter. */
	static final String ROLE_ADMIN = "ROLE_ADMIN";

	private final OperatorDirectory directory;

	public CurrentOperator(OperatorDirectory directory) {
		this.directory = directory;
	}

	/**
	 * The signed-in operator's id, or empty for an anonymous or customer principal or one outside the
	 * may-operate set. For {@code permitAll} reads where signed-out is the normal case.
	 */
	public Optional<OperatorId> optional(Authentication authentication) {
		if (authentication == null || !holds(authentication, ROLE_OPERATOR)) {
			return Optional.empty();
		}
		return directory.operatorFor(authentication.getName());
	}

	/** Whether the principal is a platform admin ({@code ROLE_ADMIN}). */
	public boolean isAdmin(Authentication authentication) {
		return authentication != null && holds(authentication, ROLE_ADMIN);
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

	private static boolean holds(Authentication authentication, String authority) {
		return authentication.getAuthorities().stream().anyMatch(granted -> authority.equals(granted.getAuthority()));
	}
}
