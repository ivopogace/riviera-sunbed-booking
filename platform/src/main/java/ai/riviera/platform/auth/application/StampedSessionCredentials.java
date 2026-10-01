package ai.riviera.platform.auth.application;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.auth.api.SessionCredentials;
import ai.riviera.platform.auth.vocabulary.AuthRoles;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * Recomputes a {@link SessionPrincipal}'s {@link CredentialStamp} against the live account (#1306). Only
 * {@code SessionAuthentication} stores a session context, always a {@code SessionPrincipal}; any other principal
 * is MockMvc's and is current.
 */
@Component
public class StampedSessionCredentials implements SessionCredentials {

	private static final String ROLE_CUSTOMER = AuthRoles.authority(AuthRoles.CUSTOMER);
	private static final String ROLE_ADMIN = AuthRoles.authority(AuthRoles.ADMIN);

	private final CustomerAccounts customers;
	private final OperatorAccounts operators;

	public StampedSessionCredentials(CustomerAccounts customers, OperatorAccounts operators) {
		this.customers = customers;
		this.operators = operators;
	}

	@Override
	public boolean isCurrent(Authentication authentication) {
		if (!(authentication.getPrincipal() instanceof SessionPrincipal principal)) {
			return true;
		}
		if (holds(authentication, ROLE_CUSTOMER)) {
			return customers.liveCredential(authentication.getName())
					.filter(account -> principal.credentialStamp()
							.equals(CredentialStamp.customer(account.accountId(), account.passwordHash())))
					.isPresent();
		}
		return operators.findByUsername(authentication.getName())
				.filter(credential -> AuthRoles.OPERATOR_MAY_AUTHENTICATE.contains(credential.status()))
				.filter(credential -> credential.admin() == holds(authentication, ROLE_ADMIN))
				.filter(credential -> principal.credentialStamp()
						.equals(CredentialStamp.operator(credential.username(), credential.passwordHash())))
				.isPresent();
	}

	private static boolean holds(Authentication authentication, String authority) {
		return authentication.getAuthorities().stream().anyMatch(granted -> authority.equals(granted.getAuthority()));
	}
}
