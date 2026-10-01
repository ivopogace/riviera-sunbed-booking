package ai.riviera.platform.auth.vocabulary;

import java.util.Set;

import ai.riviera.platform.operator.vocabulary.OperatorStatus;

/**
 * The role names {@code SecurityConfig} gates on and the {@code UserDetailsService}s grant (a granted
 * authority is {@code ROLE_} + the name), and the operator statuses that may hold a session: approval gates
 * tourist visibility, never console access.
 */
public final class AuthRoles {

	/** Every operator; gates the operator write surface. Per-venue checks stay object-level (#13). */
	public static final String OPERATOR = "OPERATOR";
	/** The platform admin ({@code is_admin}); gates {@code /api/admin/**}. Carried alongside {@link #OPERATOR}. */
	public static final String ADMIN = "ADMIN";
	/** Every customer principal; gates {@code /api/me/**}. */
	public static final String CUSTOMER = "CUSTOMER";

	public static final Set<OperatorStatus> OPERATOR_MAY_AUTHENTICATE =
			Set.of(OperatorStatus.ACTIVE, OperatorStatus.PENDING);

	private AuthRoles() {
	}

	/** The granted authority for {@code role}: {@code ROLE_} + its name. */
	public static String authority(String role) {
		return "ROLE_" + role;
	}
}
