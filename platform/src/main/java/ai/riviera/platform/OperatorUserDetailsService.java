package ai.riviera.platform;

import java.util.EnumSet;
import java.util.Set;

import org.jspecify.annotations.NullMarked;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;

/**
 * The platform edge's Spring Security {@link UserDetailsService}: resolves a session-login username
 * to a per-operator principal backed by the DB, replacing the single shared in-memory {@code operator}
 * user. Authentication is an edge concern (RV-BE-11), so this — and all encoding/verifying — lives in
 * the application root, not the {@code operator} module: it reads the module's stored credential via
 * {@link OperatorAccounts} (the module owns the opaque hash; the edge verifies it against the
 * delegating {@code PasswordEncoder}) and hands a {@link UserDetails} to {@code DaoAuthenticationProvider}.
 *
 * <p>Every operator carries the {@code OPERATOR} role (the per-<em>venue</em> authorization is
 * object-level — resolved from the principal to an {@link ai.riviera.platform.operator.vocabulary.OperatorId}
 * and enforced in the application services, invariant #13 — not role-level). A platform-<strong>admin</strong>
 * account ({@code is_admin}) additionally carries {@code ADMIN}, which gates the role-based
 * {@code /api/admin/**} operator-approval surface (invariant #13's admin exemption); it keeps
 * {@code OPERATOR} too, so an admin that also owns venues still reaches the operator console. An
 * account outside the may-authenticate set ({@code ACTIVE} or {@code PENDING} — approval gates
 * tourist visibility, not console access) is built {@code disabled}, so the provider rejects it in
 * its pre-authentication check <em>before</em> the password is examined (no existence/timing
 * oracle); an account with no provisioned credential (null hash) or an unknown username is a
 * {@link UsernameNotFoundException}.
 */
@NullMarked
class OperatorUserDetailsService implements UserDetailsService {

	/** The single role that gates the operator write surface (kept in lockstep with {@code SecurityConfig}). */
	static final String OPERATOR_ROLE = "OPERATOR";
	/** The platform-admin role that gates the {@code /api/admin/**} approval surface. */
	static final String ADMIN_ROLE = "ADMIN";

	/** The statuses the edge lets authenticate: approval gates tourist visibility, never console access. */
	private static final Set<OperatorStatus> MAY_AUTHENTICATE =
			EnumSet.of(OperatorStatus.ACTIVE, OperatorStatus.PENDING);

	private final OperatorAccounts accounts;

	OperatorUserDetailsService(OperatorAccounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String username) {
		OperatorCredential credential = accounts.findByUsername(username)
				.filter(c -> c.passwordHash() != null)
				.orElseThrow(() -> new UsernameNotFoundException("no operator credential"));
		// An admin carries both ADMIN (approval surface) and OPERATOR (console for any venues it owns).
		String[] roles = credential.admin()
				? new String[] {OPERATOR_ROLE, ADMIN_ROLE}
				: new String[] {OPERATOR_ROLE};
		return User.withUsername(credential.username())
				.password(credential.passwordHash())
				.roles(roles)
				.disabled(!MAY_AUTHENTICATE.contains(credential.status()))
				.build();
	}
}
