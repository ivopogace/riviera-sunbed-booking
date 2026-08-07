package ai.riviera.platform;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * Invalidates every server-side session belonging to one principal — used wherever an account loses
 * the right to the sessions it already has, so an attacker's (or an ex-operator's) live session cannot
 * outlive the thing that authorized it. Reading / deleting sessions is platform-edge machinery
 * (RV-BE-11), not domain: neither {@code customer} nor {@code operator} may import
 * {@code org.springframework.session}.
 *
 * <p>Backed by Spring Session's {@link FindByIndexNameSessionRepository} (the JDBC-backed
 * {@code JdbcIndexedSessionRepository} here), which indexes sessions by principal name — the
 * customer's email or the operator's username, whichever value that principal's login stored as the
 * authentication name.
 *
 * <p><strong>The index is not principal-type-scoped.</strong> An operator whose username were literally
 * some customer's email address would have both sets of sessions revoked together. That is accepted:
 * the failure direction is <em>over</em>-revocation — someone is signed out who needn't have been —
 * never under-revocation, so it can cost convenience but not security. Package-private (invariant #11).
 */
@Component
class PrincipalSessionRevoker {

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	PrincipalSessionRevoker(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	/**
	 * Delete every session whose principal name matches {@code principalName}.
	 *
	 * <p><strong>Callers pairing this with a state change must bracket it:</strong> call it
	 * <em>before</em> the change, so a failure here cannot leave the state changed behind an error saying
	 * nothing happened — and <em>again after</em>, because revoking only first leaves a window in which
	 * the old credential or status is still valid, so a sign-in landing there would produce a session
	 * that outlives the change. Both calls are idempotent deletes; the second is normally a no-op and is
	 * <strong>not</strong> dead code. A principal that cannot be named until the change has run is why
	 * two of the three callers first make a pure read.
	 */
	void revokeAll(String principalName) {
		revokeAllExcept(principalName, null);
	}

	/**
	 * Delete every session of {@code principalName} except {@code keepSessionId} — the self-service
	 * password-change case, where the point is to evict everyone <em>else</em> (a shared device, a
	 * thief) while leaving the session doing the change signed in. Pass {@code null} to keep nothing.
	 *
	 * <p><strong>Two ordering constraints bind the password-change callers</strong> (#344). Call this
	 * <em>before</em> the credential write, so a failure here cannot leave the hash rotated behind an error
	 * saying nothing happened — that one is load-bearing. And pass the <em>pre-rotation</em> id, which is
	 * the only id this query can see: since #359 {@link SessionIdentity#rotate} deletes the caller's row
	 * outright and its replacement is not persisted until the filter commits, so an id read after rotating
	 * names nothing here and the keep-contract would be silently vacuous.
	 */
	void revokeAllExcept(String principalName, String keepSessionId) {
		sessions.findByPrincipalName(principalName).keySet().stream()
				.filter(id -> !id.equals(keepSessionId))
				.forEach(sessions::deleteById);
	}
}
