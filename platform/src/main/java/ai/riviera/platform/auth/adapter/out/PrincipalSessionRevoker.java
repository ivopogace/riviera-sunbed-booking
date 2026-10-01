package ai.riviera.platform.auth.adapter.out;

import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

import ai.riviera.platform.auth.api.SessionRevocation;

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
public class PrincipalSessionRevoker implements SessionRevocation {

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	public PrincipalSessionRevoker(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	@Override
	public void revokeAll(String principalName) {
		revokeAllExcept(principalName, null);
	}

	@Override
	public void revokeAllExcept(String principalName, String keepSessionId) {
		sessions.findByPrincipalName(principalName).keySet().stream()
				.filter(id -> !id.equals(keepSessionId))
				.forEach(sessions::deleteById);
	}
}
