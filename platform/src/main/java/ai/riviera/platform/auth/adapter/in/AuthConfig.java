package ai.riviera.platform.auth.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

import ai.riviera.platform.auth.application.CustomerUserDetailsService;
import ai.riviera.platform.auth.application.OperatorUserDetailsService;
import ai.riviera.platform.auth.application.RecoveryProperties;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * The authentication beans: one {@link AuthenticationManager} per principal type over DB-backed credentials
 * ({@link #operatorDetailsService} + {@link #passwordEncoder()}); no JWT, no custom token filter. Public only so a
 * web slice can import it.
 */
@Configuration
@EnableConfigurationProperties({RivieraOperatorProperties.class, RecoveryProperties.class})
public class AuthConfig {

	/**
	 * The operator authentication manager, built by Spring Security's global
	 * {@link AuthenticationConfiguration} from {@link #operatorDetailsService} +
	 * {@link #passwordEncoder()}. No custom filter.
	 */
	@Bean
	AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) {
		return configuration.getAuthenticationManager();
	}

	/**
	 * The CUSTOMER manager, separate from the operator one so a customer credential can never
	 * authenticate as an operator. {@link CustomerUserDetailsService} is built inline: a second
	 * {@code UserDetailsService} bean would make {@link AuthenticationConfiguration} ambiguous.
	 */
	@Bean
	AuthenticationManager customerAuthenticationManager(CustomerAccounts customerAccounts,
			PasswordEncoder passwordEncoder) {
		DaoAuthenticationProvider provider =
				new DaoAuthenticationProvider(new CustomerUserDetailsService(customerAccounts));
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

	/** Delegating encoder ({@code {bcrypt}} by default) — verifies the stored per-operator hash. */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/**
	 * The per-operator {@link UserDetailsService}: each login resolves to a DB-backed operator account via
	 * {@link OperatorAccounts}; defining it replaces Boot's auto-generated default user.
	 */
	@Bean
	UserDetailsService operatorDetailsService(OperatorAccounts accounts) {
		return new OperatorUserDetailsService(accounts);
	}
}
