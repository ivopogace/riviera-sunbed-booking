package ai.riviera.platform;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * The calling request's server-side session <em>identity</em> — reading it, and retiring it. Both
 * self-service password endpoints ({@link OperatorAccountController}, {@link MyAccountController}) need
 * exactly these two operations in exactly this order, and had already copied the read between them;
 * #344 added the rotation, which is the half that is easy to get wrong. {@link SessionAuthentication} has
 * carried a byte-identical guarded rotation since S1 for session-fixation defence and now calls
 * {@link #rotate} too, so the idiom has one implementation rather than two.
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
	 * Give the calling request a fresh session identity, so the cookie value that reached it stops
	 * authenticating anyone — the rotation half of a password change (#344) and the session-fixation
	 * defence on every login path (design D-1). Spring Session's filter writes the replacement
	 * {@code SESSION} cookie on the same response, so a legitimate caller notices nothing; a copy of the
	 * old cookie is simply dead.
	 *
	 * <p><strong>Must run after any {@code revokeAllExcept} that spares this session.</strong> That revoke's
	 * keep-id has to be one its own query can see, and after this call none is: the caller's row is gone and
	 * its replacement is not persisted until the filter commits, so an id read afterwards names nothing and
	 * the keep-contract would be vacuous. (Before #359 the mis-ordering was worse than vacuous — the row
	 * survived under the old id, so a post-rotation keep-id failed the filter and the revoke deleted the
	 * caller's own session.)
	 *
	 * <p><strong>Why this is not {@code changeSessionId()}</strong> (issue #359). That keeps the same
	 * {@code SPRING_SESSION} row and defers the new id to the filter's post-request save, which writes
	 * <em>that</em> request's in-memory id. Any second request touching the session performs the same write
	 * on completion, so one that loaded before the rotation committed and finished after wrote the OLD id
	 * back — resurrecting the exfiltrated cookie and orphaning the caller's new one. On the login path the
	 * overlap is attacker-controllable, which makes it a session-fixation bypass rather than a race.
	 * Invalidating issues the {@code DELETE} immediately, so the stale write has no row left to target.
	 *
	 * <p>Attributes and the inactive interval are carried over, keeping this a drop-in for the old
	 * semantics — in particular {@code SPRING_SECURITY_CONTEXT}, which both keeps the caller signed in and
	 * is what {@code PrincipalNameIndexResolver} derives the {@code PRINCIPAL_NAME} index from, so
	 * {@link PrincipalSessionRevoker} still finds the replacement. Row identity, creation time and
	 * last-access time deliberately do not survive: a new row is the mechanism, not a side effect.
	 *
	 * <p>A concurrent request that <em>adds</em> an attribute now fails on the deleted parent row instead
	 * of silently clobbering — the intended direction, and not a new failure class: the revoker's deletes
	 * have done the same to other sessions since #113.
	 *
	 * <p>A request with no session is a no-op rather than an error: a rotation with nothing to rotate has
	 * nothing to fail about.
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
