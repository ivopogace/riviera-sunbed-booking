package ai.riviera.platform;

import java.io.IOException;

import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

import ai.riviera.platform.auth.api.SessionCredentials;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Admits a session only while its credential is current (#1306), as {@link SessionCredentials} judges it. A stale
 * one is invalidated and the request goes on anonymous.
 */
final class SessionCredentialFilter extends OncePerRequestFilter {

	private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();
	private final SessionCredentials credentials;

	SessionCredentialFilter(SessionCredentials credentials) {
		this.credentials = credentials;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		HttpSession session = request.getSession(false);
		if (session != null
				&& session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)
						instanceof SecurityContext stored
				&& stored.getAuthentication() != null && !credentials.isCurrent(stored.getAuthentication())) {
			session.invalidate();
			contextHolder.clearContext();
		}
		chain.doFilter(request, response);
	}
}
