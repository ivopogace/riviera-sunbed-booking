package ai.riviera.platform.venue.adapter.in;

import org.springframework.security.core.Authentication;

/**
 * Reads the session principal for a {@code permitAll} read, where signed-out is the normal case:
 * whether it holds the operator or the admin role. {@code operator::api} never sees a Spring Security
 * type, so the role check stays here and only an operator principal's name reaches
 * {@code OperatorDirectory#operatorFor} (a customer named like an operator resolves to nothing).
 */
final class OperatorPrincipal {

	/** The authority every operator principal carries, admins included. */
	private static final String ROLE_OPERATOR = "ROLE_OPERATOR";
	/** The platform-admin authority, kept in step with {@code is_admin} by the edge's session filter. */
	private static final String ROLE_ADMIN = "ROLE_ADMIN";

	private OperatorPrincipal() {
	}

	/** Whether the principal holds {@code ROLE_OPERATOR}; {@code false} for an anonymous request. */
	static boolean isOperator(Authentication authentication) {
		return holds(authentication, ROLE_OPERATOR);
	}

	/** Whether the principal is a platform admin ({@code ROLE_ADMIN}); {@code false} for an anonymous request. */
	static boolean isAdmin(Authentication authentication) {
		return holds(authentication, ROLE_ADMIN);
	}

	private static boolean holds(Authentication authentication, String authority) {
		return authentication != null && authentication.getAuthorities().stream()
				.anyMatch(granted -> authority.equals(granted.getAuthority()));
	}
}
