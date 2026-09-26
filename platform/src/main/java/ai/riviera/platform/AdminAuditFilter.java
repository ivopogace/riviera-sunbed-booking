package ai.riviera.platform;

import java.io.IOException;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import ai.riviera.platform.audit.api.AdminAuditLog;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The edge's fence over {@code audit} (ADR-0013, ADR-0017): records every mutating {@code /api/admin/**}
 * action in the {@link AdminAuditLog} (actor, method, path, status, sanitized
 * {@link AdminAuditReasons#HEADER} grounds), keyed on the path prefix, so a new admin surface is audited
 * the day it ships. After {@code AuthorizationFilter}, only principals past the gate leave a row (the
 * principal check holds if the chain drifts), written after the action with its real status, a throw as
 * 500. A failed write never fails the action, it logs ERROR: {@code RESPONSIBILITIES.md} §audit.
 */
final class AdminAuditFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(AdminAuditFilter.class);

	/** Reads are never audited — the record is action-level, not a request log. */
	private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

	private final AdminAuditLog auditLog;

	/** The audited namespace, a path prefix; {@code SecurityConfig} supplies its role-gated one. */
	private final String auditedPathPrefix;

	AdminAuditFilter(AdminAuditLog auditLog, String auditedPathPrefix) {
		this.auditLog = auditLog;
		this.auditedPathPrefix = auditedPathPrefix;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !(request.getRequestURI().startsWith(auditedPathPrefix)
				&& MUTATING_METHODS.contains(request.getMethod()));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		try {
			chain.doFilter(request, response);
		}
		catch (ServletException | IOException | RuntimeException e) {
			// Unwinding past the advice becomes the container's 500; record that, not the stale status.
			append(request, HttpStatus.INTERNAL_SERVER_ERROR.value());
			throw e;
		}
		append(request, response.getStatus());
	}

	private void append(HttpServletRequest request, int status) {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication == null || !authentication.isAuthenticated()
				|| authentication instanceof AnonymousAuthenticationToken) {
			return;
		}
		try {
			auditLog.append(authentication.getName(), request.getMethod(), request.getRequestURI(), status,
					AdminAuditReasons.sanitize(request.getHeader(AdminAuditReasons.HEADER)));
		}
		catch (RuntimeException e) {
			// Broad by contract (class Javadoc): a lost row must never fail or mask the performed action.
			log.error("Admin audit record lost for {} {} by {} (status {})", request.getMethod(),
					request.getRequestURI(), authentication.getName(), status, e);
		}
	}
}
