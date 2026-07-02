package ai.riviera.platform;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;

/**
 * The platform edge's Spring Security {@link UserDetailsService} (#74): resolves a session-login username (issue #109)
 * to a per-operator principal backed by the DB, replacing the single shared in-memory {@code operator}
 * user. Authentication is an edge concern (RV-BE-11), so this — and all encoding/verifying — lives in
 * the application root, not the {@code operator} module: it reads the module's stored credential via
 * {@link OperatorAccounts} (the module owns the opaque hash; the edge verifies it against the
 * delegating {@code PasswordEncoder}) and hands a {@link UserDetails} to {@code DaoAuthenticationProvider}.
 *
 * <p>Every operator carries the single {@code OPERATOR} role (the per-<em>venue</em> authorization is
 * object-level — resolved from the principal to an {@link ai.riviera.platform.operator.vocabulary.OperatorId}
 * and enforced in the application services, invariant #13 — not role-level). A {@code SUSPENDED}
 * account is built {@code disabled}, so the provider rejects it in its pre-authentication check
 * <em>before</em> the password is examined (no existence/timing oracle); an account with no
 * provisioned credential (null hash) or an unknown username is a {@link UsernameNotFoundException}.
 */
class OperatorUserDetailsService implements UserDetailsService {

	/** The single role that gates the operator write surface (kept in lockstep with {@code SecurityConfig}). */
	static final String OPERATOR_ROLE = "OPERATOR";

	private final OperatorAccounts accounts;

	OperatorUserDetailsService(OperatorAccounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String username) {
		OperatorCredential credential = accounts.findByUsername(username)
				.filter(c -> c.passwordHash() != null)
				.orElseThrow(() -> new UsernameNotFoundException("no operator credential"));
		return User.withUsername(credential.username())
				.password(credential.passwordHash())
				.roles(OPERATOR_ROLE)
				.disabled(!credential.active())
				.build();
	}
}
