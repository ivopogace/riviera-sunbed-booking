package ai.riviera.platform;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The one edge session-establishment step, shared by every login path: the operator/customer form logins
 * and register auto-sign-in ({@code AuthController}, S1) and the SSO callback
 * ({@code SsoController}). It rotates the session id if one already exists (session-fixation
 * defence, design D-1), then persists the authenticated {@link SecurityContext} so subsequent requests
 * ride the {@code SESSION} cookie. Centralized so the fixation + save sequence has exactly one
 * implementation. Pinned by {@code AuthSessionIT.sessionIdRotatesOnLogin}.
 */
final class SessionAuthentication {

	private static final SecurityContextHolderStrategy CONTEXT_STRATEGY =
			SecurityContextHolder.getContextHolderStrategy();

	private SessionAuthentication() {
	}

	static void establish(SecurityContextRepository repository, Authentication authentication,
			HttpServletRequest request, HttpServletResponse response) {
		SessionIdentity.rotate(request);
		SecurityContext context = CONTEXT_STRATEGY.createEmptyContext();
		context.setAuthentication(authentication);
		CONTEXT_STRATEGY.setContext(context);
		repository.saveContext(context, request, response);
	}
}
