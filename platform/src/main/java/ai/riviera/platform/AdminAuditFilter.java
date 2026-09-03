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
 * Records every mutating {@code /api/admin/**} action in the {@link AdminAuditLog} (required
 * by ADR-0013) — the fence over the {@code audit} module's mechanism (ADR-0017): actor, method, path, outcome status, and the optional sanitized
 * {@link AdminAuditReasons#HEADER} grounds. Blanket coverage by construction — a new admin surface
 * is audited the day it ships, with no per-controller instrumentation to forget.
 *
 * <p><strong>Positioned after {@code AuthorizationFilter}, inside the API security chain</strong>
 * ({@code SecurityConfig}), so only requests that passed authentication <em>and</em> authorization
 * reach it: the audit answers "what did an authenticated principal do past the gate", never "who
 * knocked" — anonymous 401s, CSRF 403s and wrong-role 403s are rejected upstream and leave no row.
 * The belt-and-braces principal check below keeps that contract even if the chain order drifts.
 * Recording happens <em>after</em> the action with its real outcome status (including
 * application-level 4xx — a failed destructive attempt is signal); an exception unwinding past the
 * handler advice is recorded as the 500 it becomes.
 *
 * <p><strong>The actor is whoever the namespace admitted</strong> — since #348 A4 tightened the last
 * carve-out ({@code /api/admin/payout-batches}, then OPERATOR-gated), every path in the namespace is
 * gated to the platform ADMIN, so the actor is that admin. The filter does not depend on this: it keys
 * on the path prefix and records whatever principal got past the gate, so a future surface admitted on
 * some other authority is audited the day it ships without touching this class.
 *
 * <p><strong>A failed audit insert never fails the admin action</strong> (logged at ERROR instead):
 * write-after cannot un-do the action it records, and the audited actions are themselves writes on
 * the same database, so an audit-lost-while-action-succeeded window needs a mid-request DB failure.
 * Accepted Phase-1 risk, documented in the plan doc's register (R-1).
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
