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
 * <p>Callers today: customer password reset and right-to-erasure (S8 #113, AC-3), operator suspension
 * and genuine credential rotation (#128). Generalized from the customer-only {@code CustomerSessionRevoker}
 * in #128 rather than copied — the logic was never customer-specific, and a second near-identical edge
 * class is duplication the merge gate rejects.
 *
 * <p>Backed by Spring Session's {@link FindByIndexNameSessionRepository} (the JDBC-backed
 * {@code JdbcIndexedSessionRepository} in this app, V20), which indexes sessions by principal name —
 * the customer's email or the operator's username, whichever value that principal's login stored as
 * the authentication name.
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

	/** Delete every session whose principal name matches {@code principalName}. */
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
	 * saying nothing happened. And pass the <em>pre-rotation</em> id: {@link SessionIdentity#rotate} must run
	 * after this call, because the stored row keeps the old id until the filter commits — a keep-id taken
	 * after rotating matches no row, so the caller's own session would be deleted by its own revoke.
	 */
	void revokeAllExcept(String principalName, String keepSessionId) {
		sessions.findByPrincipalName(principalName).keySet().stream()
				.filter(id -> !id.equals(keepSessionId))
				.forEach(sessions::deleteById);
	}
}
