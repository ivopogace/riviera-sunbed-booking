package ai.riviera.platform;

import java.net.URI;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Edge port for the OIDC Authorization Code + PKCE flow with an external identity provider (design
 * D-3/D-4): login machinery stays at the edge, never in a module (RV-BE-11); {@code customer} owns only
 * the resulting account identity. The code exchange runs server-side, so tokens never reach browser JS.
 *
 * <p>One implementation per profile: {@code MockSsoGateway} under {@code !sso}, kept out of prod by
 * {@code MockSsoProdGuard}; under {@code sso} the real adapters throw
 * {@link UnsupportedOperationException} until credentials ship, never falling back to the mock.
 */
public interface SsoGateway {

	/** The provider's authorize URL to redirect the browser to, carrying the state + PKCE challenge. */
	URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri);

	/** Exchange the authorization code (+ PKCE verifier) for the provider-verified external identity. */
	ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, URI redirectUri);
}
