package ai.riviera.platform;

import org.jspecify.annotations.NullMarked;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;

/**
 * The platform edge's Spring Security {@link UserDetailsService} for {@code CUSTOMER} accounts — the
 * customer-side sibling of {@link OperatorUserDetailsService}. It resolves a customer
 * login email to a principal backed by the DB via the {@code customer} module's {@link CustomerAccounts}
 * port. Authentication is an edge concern (RV-BE-11): the module owns the opaque credential hash, the
 * edge verifies it against the delegating {@code PasswordEncoder} and hands a {@link UserDetails} to a
 * {@code DaoAuthenticationProvider}.
 *
 * <p>Unlike the operator side this is <strong>not</strong> a Spring bean — it is constructed inline by
 * {@code SecurityConfig#customerAuthenticationManager}. Registering a second {@code UserDetailsService}
 * bean would make Spring Boot's global {@code AuthenticationConfiguration} ambiguous and break the
 * operator manager's auto-wiring; keeping it bean-less leaves S1's operator path untouched.
 *
 * <p>Every customer carries the single {@code CUSTOMER} role — distinct from {@code OPERATOR}, so a
 * customer session never satisfies an operator role-gate (AC-5). There is no suspend / verification
 * state in S2, so the account is always enabled; an unknown email is a {@link UsernameNotFoundException},
 * mapped to the same generic 401 as a wrong password (no account enumeration, design D-8).
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
