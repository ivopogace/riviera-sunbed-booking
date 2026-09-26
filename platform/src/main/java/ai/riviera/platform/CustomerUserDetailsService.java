package ai.riviera.platform;

import org.jspecify.annotations.NullMarked;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;

/**
 * The edge's {@link UserDetailsService} for {@code CUSTOMER} accounts, sibling of the operator one:
 * resolves a login email via {@link CustomerAccounts} to an always-enabled principal with the
 * single {@link #CUSTOMER_ROLE} (never an operator role) and the opaque hash a DAO provider
 * verifies. Built inline by {@code SecurityConfig}, never a bean: a second
 * {@code UserDetailsService} bean makes {@code AuthenticationConfiguration} ambiguous. An unknown
 * email throws {@link UsernameNotFoundException}, the same 401 as a wrong password.
 */
@NullMarked
class CustomerUserDetailsService implements UserDetailsService {

	/** The role every customer principal carries (kept in lockstep with {@code SecurityConfig}). */
	static final String CUSTOMER_ROLE = "CUSTOMER";

	private final CustomerAccounts accounts;

	CustomerUserDetailsService(CustomerAccounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
		CustomerAccountCredential credential = accounts.findByEmail(email)
				.orElseThrow(() -> new UsernameNotFoundException("no customer account"));
		return User.withUsername(credential.email())
				.password(credential.passwordHash())
				.roles(CUSTOMER_ROLE)
				.build();
	}
}
