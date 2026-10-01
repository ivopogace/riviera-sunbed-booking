package ai.riviera.platform.auth.adapter.in;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * The calling request's server-side session <em>identity</em> — reading it, and retiring it. The one implementation
 * for both self-service password endpoints ({@link OperatorAccountController}, {@link MyAccountController}) and the
 * session-fixation rotation in {@link SessionAuthentication}. Edge machinery: neither {@code customer} nor
 * {@code operator} may import the servlet or Spring Session APIs.
 */
final class SessionIdentity {

	private SessionIdentity() {
	}

	/**
	 * The current session's id, or {@code null} when the request carries no server-side session — a
	 * principal authenticated by something other than the session cookie. Never creates a session: a read
	 * that started one would be a side effect, and would hand the revoke a keep-id nothing else knows.
	 */
	static String currentId(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return session != null ? session.getId() : null;
	}

	/**
	 * Retire the session into a fresh one with its interval and all attributes, {@code SPRING_SECURITY_CONTEXT} included so
	 * {@code PrincipalSessionRevoker} still finds it (fixation defence; no-op without one). After any sparing revoke, before
	 * any re-stamp. Invalidate, never {@code changeSessionId()}: a concurrent save writes the old id back.
	 */
	static void rotate(HttpServletRequest request) {
		HttpSession retiring = request.getSession(false);
		if (retiring == null) {
			return;
		}
		Map<String, Object> carried = new LinkedHashMap<>();
		for (String name : Collections.list(retiring.getAttributeNames())) {
			carried.put(name, retiring.getAttribute(name));
		}
		int maxInactiveInterval = retiring.getMaxInactiveInterval();
		retiring.invalidate();
		HttpSession replacement = request.getSession(true);
		replacement.setMaxInactiveInterval(maxInactiveInterval);
		carried.forEach(replacement::setAttribute);
	}
}
