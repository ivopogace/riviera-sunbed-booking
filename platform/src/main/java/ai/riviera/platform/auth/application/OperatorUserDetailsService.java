package ai.riviera.platform.auth.application;

import java.util.Arrays;

import org.jspecify.annotations.NullMarked;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.auth.vocabulary.AuthRoles;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;

/**
 * The edge's {@link UserDetailsService} (login machinery stays out of {@code operator}, RV-BE-11):
 * hands {@code DaoAuthenticationProvider} the stored hash, read via {@link OperatorAccounts}. Every
 * operator gets {@code OPERATOR} (per-venue checks stay object-level, invariant #13); {@code is_admin}
 * adds {@code ADMIN} for {@code /api/admin/**}. A status outside {@link AuthRoles#OPERATOR_MAY_AUTHENTICATE} is built
 * {@code disabled}: refused, but only after the password check still runs (Spring's default; keep it),
 * so it costs one bcrypt like any failure. A null hash or unknown name: {@link UsernameNotFoundException}.
 */
@NullMarked
public class OperatorUserDetailsService implements UserDetailsService {

	private final OperatorAccounts accounts;

	public OperatorUserDetailsService(OperatorAccounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String username) {
		OperatorCredential credential = accounts.findByUsername(username)
				.filter(c -> c.passwordHash() != null)
				.orElseThrow(() -> new UsernameNotFoundException("no operator credential"));
		// An admin carries both ADMIN (approval surface) and OPERATOR (console for any venues it owns).
		String[] roles = credential.admin() ? new String[] {AuthRoles.OPERATOR, AuthRoles.ADMIN}
				: new String[] {AuthRoles.OPERATOR};
		return new SessionPrincipal(credential.username(), credential.passwordHash(),
				AuthRoles.OPERATOR_MAY_AUTHENTICATE.contains(credential.status()), AuthorityUtils.createAuthorityList(
						Arrays.stream(roles).map(AuthRoles::authority).toArray(String[]::new)),
				CredentialStamp.operator(credential.username(), credential.passwordHash()));
	}
}
