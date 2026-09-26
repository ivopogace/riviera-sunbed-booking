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
 * The edge's {@link UserDetailsService} (login machinery stays out of {@code operator}, RV-BE-11):
 * hands {@code DaoAuthenticationProvider} the stored hash, read via {@link OperatorAccounts}. Every
 * operator gets {@code OPERATOR} (per-venue checks stay object-level, invariant #13); {@code is_admin}
 * adds {@code ADMIN} for {@code /api/admin/**}. A status outside {@link #MAY_AUTHENTICATE} is built
 * {@code disabled}: refused, but only after the password check still runs (Spring's default; keep it),
 * so it costs one bcrypt like any failure. A null hash or unknown name: {@link UsernameNotFoundException}.
 */
@NullMarked
class OperatorUserDetailsService implements UserDetailsService {

	/** The single role that gates the operator write surface (kept in lockstep with {@code SecurityConfig}). */
	static final String OPERATOR_ROLE = "OPERATOR";
	/** The platform-admin role that gates the {@code /api/admin/**} approval surface. */
	static final String ADMIN_ROLE = "ADMIN";

	/** The statuses the edge lets authenticate: approval gates tourist visibility, never console access. */
	static final Set<OperatorStatus> MAY_AUTHENTICATE =
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
