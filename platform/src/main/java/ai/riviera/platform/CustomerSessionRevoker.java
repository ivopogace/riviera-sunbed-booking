package ai.riviera.platform;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * Invalidates every server-side session belonging to one principal (S8 #113, AC-3) — used after a
 * password reset so an attacker's live session cannot outlive the credential it was riding. Reading /
 * deleting sessions is platform-edge machinery (RV-BE-11), not {@code customer} domain.
 *
 * <p>Backed by Spring Session's {@link FindByIndexNameSessionRepository} (the JDBC-backed
 * {@code JdbcIndexedSessionRepository} in this app, V20), which indexes sessions by principal name — the
 * customer's email, the same value a login stores as the authentication name. Package-private
 * (invariant #11).
 */
@Component
class CustomerSessionRevoker {

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	CustomerSessionRevoker(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	/** Delete every session whose principal name matches {@code principalName} (the customer's email). */
	void revokeAll(String principalName) {
		sessions.findByPrincipalName(principalName).keySet().forEach(sessions::deleteById);
	}
}
