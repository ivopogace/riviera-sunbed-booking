package ai.riviera.platform.auth.api;

/**
 * Ends every server-side session of one principal (customer email or operator username) when the account loses
 * the right to them. Synchronous, and a separate store: no transaction makes it atomic with the state change it
 * guards. Ordering against that change: {@code RESPONSIBILITIES.md} §Platform edge.
 */
public interface SessionRevocation {

	/**
	 * Delete every session of {@code principalName}. Paired with a state change, call it before (a failed revoke then
	 * leaves the state unchanged) <em>and again after</em>: that ends a sign-in saved in between at once, where the
	 * credential stamp would end it only on its next request; usually a no-op, <strong>not</strong> dead code.
	 */
	void revokeAll(String principalName);

	/**
	 * As {@link #revokeAll} but sparing {@code keepSessionId} ({@code null} spares nothing), for the
	 * self-service password change. Call it before the credential write, with the id read before
	 * {@code SessionIdentity#rotate}: a post-rotation id names no stored row, so the keep is vacuous.
	 */
	void revokeAllExcept(String principalName, String keepSessionId);
}
