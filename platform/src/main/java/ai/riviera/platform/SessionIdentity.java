package ai.riviera.platform;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * The calling request's server-side session <em>identity</em> — reading it, and retiring it. Both
 * self-service password endpoints ({@link OperatorAccountController}, {@link MyAccountController}) need
 * exactly these two operations in exactly this order, and had already copied the read between them;
 * #344 added the rotation, which is the half that is easy to get wrong, so it lives here once.
 *
 * <p>Session-identity lifecycle is platform-edge machinery (RV-BE-11): neither {@code customer} nor
 * {@code operator} may import the servlet or Spring Session APIs, so this cannot live in a module.
 * Package-private (invariant #11).
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
	 * Give the calling session a fresh id, so the cookie value that reached this request stops
	 * authenticating anyone — the {@code changeSessionId()} half of a password change (#344). Spring
	 * Session's filter persists the new id and writes the replacement {@code SESSION} cookie on the same
	 * response, so a legitimate caller notices nothing; a copy of the old cookie is simply dead.
	 *
	 * <p><strong>Must run after any {@code revokeAllExcept} that spares this session.</strong> The stored
	 * row keeps the old id until the filter commits, so a revoke handed the post-rotation id would fail to
	 * match its own keep-entry and delete the caller's session.
	 *
	 * <p>A request with no session is a no-op rather than an error: {@code changeSessionId()} is specified
	 * to throw {@link IllegalStateException} there, and a password change that legitimately has no session
	 * to rotate has nothing to fail about.
	 */
	static void rotate(HttpServletRequest request) {
		if (request.getSession(false) != null) {
			request.changeSessionId();
		}
	}
}
