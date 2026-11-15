package ai.riviera.platform.auth.application;

/**
 * The anti-forgery material an SSO authorize sends to the provider (design D-3): the opaque {@code state} the
 * callback must echo, the PKCE S256 {@code codeChallenge} of the session-held verifier, and the OIDC {@code nonce}
 * the ID token must carry back (ASVS 10.5). All three are minted per round trip and kept server-side.
 */
public record SsoAuthorizationChallenge(String state, String codeChallenge, String nonce) {

	public SsoAuthorizationChallenge {
		if (state == null || state.isBlank()) {
			throw new IllegalArgumentException("state must not be blank");
		}
		if (codeChallenge == null || codeChallenge.isBlank()) {
			throw new IllegalArgumentException("codeChallenge must not be blank");
		}
		if (nonce == null || nonce.isBlank()) {
			throw new IllegalArgumentException("nonce must not be blank");
		}
	}
}
