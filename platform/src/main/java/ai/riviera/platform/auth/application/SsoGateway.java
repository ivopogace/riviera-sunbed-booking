package ai.riviera.platform.auth.application;

import java.net.URI;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Edge port for the OIDC Authorization Code + PKCE flow with an external identity provider (design
 * D-3/D-4): login machinery stays in {@code auth}, never in a domain module (RV-BE-11); {@code customer} owns only
 * the resulting account identity. The code exchange runs server-side, so tokens never reach browser JS.
 *
 * <p>One implementation per profile: {@code MockSsoGateway} under {@code !sso}, refused without {@code demo}
 * by {@code MockSsoProdGuard}; under {@code sso} the real adapters throw
 * {@link UnsupportedOperationException} until credentials ship, never falling back to the mock.
 */
public interface SsoGateway {

	/** The provider's authorize URL to redirect the browser to, carrying the state, PKCE challenge and nonce. */
	URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri);

	/**
	 * Exchange the code (+ PKCE verifier) for the verified identity, refusing an ID token whose {@code nonce} is not
	 * {@code expectedNonce} or whose issuer is not the provider's ({@link SsoProviders#issuer}).
	 */
	ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, String expectedNonce,
			URI redirectUri);

	/**
	 * Whether this IdP signs anyone in as a canned identity (the mock): then a linked operator is reachable by any
	 * visitor, so the edge refuses an admin's link and sign-in (#276). No default, so a new gateway must answer.
	 */
	boolean cooperative();
}
