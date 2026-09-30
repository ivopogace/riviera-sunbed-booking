package ai.riviera.platform;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The edge's session-establishment steps, one implementation each: {@link #establish} serves every login path
 * (the form logins and register auto-sign-in in {@code AuthController}, the SSO callback), rotating any existing
 * session id (fixation defence, design D-1) and persisting the authenticated {@link SecurityContext};
 * {@link #restamp} serves the self-service password changes. Pinned by {@code AuthSessionIT.sessionIdRotatesOnLogin}.
 */
final class SessionAuthentication {

	private static final SecurityContextHolderStrategy CONTEXT_STRATEGY =
			SecurityContextHolder.getContextHolderStrategy();

	private SessionAuthentication() {
	}

	static void establish(SecurityContextRepository repository, Authentication authentication,
			HttpServletRequest request, HttpServletResponse response) {
		if (!(authentication.getPrincipal() instanceof SessionPrincipal)) {
			throw new IllegalArgumentException("a session holds only a stamped SessionPrincipal (#1306)");
		}
		SessionIdentity.rotate(request);
		save(repository, authentication, request, response);
	}

	/**
	 * Re-stamp the caller's session with {@code credentialStamp}, of the hash it just wrote, so
	 * {@link SessionCredentialFilter} keeps admitting it (#1306). Run after {@link SessionIdentity#rotate}; a no-op
	 * without a server-side session.
	 */
	static void restamp(SecurityContextRepository repository, String credentialStamp, HttpServletRequest request,
			HttpServletResponse response) {
		Authentication current = CONTEXT_STRATEGY.getContext().getAuthentication();
		if (current == null || request.getSession(false) == null) {
			return;
		}
		SessionPrincipal principal = SessionPrincipal.erased(current.getName(), current.getAuthorities(), credentialStamp);
		save(repository, UsernamePasswordAuthenticationToken.authenticated(principal, null, current.getAuthorities()),
				request, response);
	}

	private static void save(SecurityContextRepository repository, Authentication authentication,
			HttpServletRequest request, HttpServletResponse response) {
		SecurityContext context = CONTEXT_STRATEGY.createEmptyContext();
		context.setAuthentication(authentication);
		CONTEXT_STRATEGY.setContext(context);
		repository.saveContext(context, request, response);
	}
}
