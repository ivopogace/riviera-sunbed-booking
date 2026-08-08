package ai.riviera.platform;

/**
 * The per-request anti-forgery material an SSO authorize call generates and stashes in the HTTP session
 * (design D-3): an opaque {@code state} nonce (compared at the callback to defeat
 * CSRF / code-injection — invariant on the callback) and the PKCE {@code codeChallenge} (the S256 hash
 * of the session-held {@code code_verifier}). Both are minted at authorize-time and never leave the
 * server except inside the provider redirect URL.
 */
public record SsoAuthorizationChallenge(String state, String codeChallenge) {

	public SsoAuthorizationChallenge {
		if (state == null || state.isBlank()) {
			throw new IllegalArgumentException("state must not be blank");
		}
		if (codeChallenge == null || codeChallenge.isBlank()) {
			throw new IllegalArgumentException("codeChallenge must not be blank");
		}
	}
}
