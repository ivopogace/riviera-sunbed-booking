package ai.riviera.platform;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * Invalidates every server-side session of one principal when an account loses the right to them. Edge
 * machinery, synchronous (RV-BE-11): {@code customer} and {@code operator} never import
 * {@code org.springframework.session}. A separate store, so no {@code @Transactional} makes it atomic
 * with the state change it guards: a failed trailing revoke still errors after the change has landed.
 *
 * <p>Found through {@link FindByIndexNameSessionRepository}'s principal-name index (customer email or
 * operator username), which is not type-scoped: a name clash revokes both, accepted as over-revocation.
 */
@Component
class PrincipalSessionRevoker {

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	PrincipalSessionRevoker(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	/**
	 * Delete every session of {@code principalName}. Paired with a state change, call it before (a
	 * failed revoke then leaves the state unchanged) <em>and again after</em> (a sign-in in between
	 * would outlive the change); the second call is usually a no-op, <strong>not</strong> dead code.
	 */
	void revokeAll(String principalName) {
		revokeAllExcept(principalName, null);
	}

	/**
	 * As {@link #revokeAll} but sparing {@code keepSessionId} ({@code null} spares nothing), for the
	 * self-service password change. Call it before the credential write, with the id read before
	 * {@link SessionIdentity#rotate}: a post-rotation id names no stored row, so the keep is vacuous.
	 */
	void revokeAllExcept(String principalName, String keepSessionId) {
		sessions.findByPrincipalName(principalName).keySet().stream()
				.filter(id -> !id.equals(keepSessionId))
				.forEach(sessions::deleteById);
	}
}
