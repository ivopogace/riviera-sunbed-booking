package ai.riviera.platform.auth.application;

import org.jspecify.annotations.NullMarked;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.auth.vocabulary.AuthRoles;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;

/**
 * The edge's {@link UserDetailsService} for {@code CUSTOMER} accounts, sibling of the operator one:
 * resolves a login email via {@link CustomerAccounts} to an always-enabled principal with the
 * single {@link AuthRoles#CUSTOMER} role (never an operator role) and the opaque hash a DAO provider
 * verifies. Built inline by {@code AuthConfig}, never a bean: a second
 * {@code UserDetailsService} bean makes {@code AuthenticationConfiguration} ambiguous. An unknown or
 * SSO-only email throws {@link UsernameNotFoundException}, the same 401 as a wrong password.
 */
@NullMarked
public class CustomerUserDetailsService implements UserDetailsService {

	private final CustomerAccounts accounts;

	public CustomerUserDetailsService(CustomerAccounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
		LiveAccountCredential account = accounts.liveCredential(email)
				.filter(live -> live.passwordHash() != null)
				.orElseThrow(() -> new UsernameNotFoundException("no customer account"));
		return new SessionPrincipal(account.email(), account.passwordHash(), true,
				AuthorityUtils.createAuthorityList(AuthRoles.authority(AuthRoles.CUSTOMER)),
				CredentialStamp.customer(account.accountId(), account.passwordHash()));
	}
}
