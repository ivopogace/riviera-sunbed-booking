package ai.riviera.platform;

import java.io.IOException;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.operator.api.OperatorAccounts;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Admits a session only while its credential is current (#1306): the {@link SessionPrincipal}'s stamp matches the
 * live account's, and an operator's status is in the may-authenticate set with an admin flag matching
 * {@code ROLE_ADMIN}. A stale one is invalidated and the request goes on anonymous. Only {@link SessionAuthentication}
 * stores a session context, always a {@code SessionPrincipal}; any other principal is MockMvc's and passes.
 */
final class SessionCredentialFilter extends OncePerRequestFilter {

	private static final String ROLE_CUSTOMER = "ROLE_" + CustomerUserDetailsService.CUSTOMER_ROLE;
	private static final String ROLE_ADMIN = "ROLE_" + OperatorUserDetailsService.ADMIN_ROLE;

	private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();
	private final CustomerAccounts customers;
	private final OperatorAccounts operators;

	SessionCredentialFilter(CustomerAccounts customers, OperatorAccounts operators) {
		this.customers = customers;
		this.operators = operators;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		HttpSession session = request.getSession(false);
		if (session != null
				&& session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)
						instanceof SecurityContext stored
				&& stored.getAuthentication() != null && !isCurrent(stored.getAuthentication())) {
			session.invalidate();
			contextHolder.clearContext();
		}
		chain.doFilter(request, response);
	}

	private boolean isCurrent(Authentication authentication) {
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
				.filter(credential -> OperatorUserDetailsService.MAY_AUTHENTICATE.contains(credential.status()))
				.filter(credential -> credential.admin() == holds(authentication, ROLE_ADMIN))
				.filter(credential -> principal.credentialStamp()
						.equals(CredentialStamp.operator(credential.username(), credential.passwordHash())))
				.isPresent();
	}

	private static boolean holds(Authentication authentication, String authority) {
		return authentication.getAuthorities().stream().anyMatch(granted -> authority.equals(granted.getAuthority()));
	}
}
