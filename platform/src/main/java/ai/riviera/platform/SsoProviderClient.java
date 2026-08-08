package ai.riviera.platform;

import java.net.URI;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * A single-provider SSO adapter — the real per-provider integration point behind the
 * dispatching {@link SsoGateway}. Google is plain OIDC; Apple needs an ES256 client-secret JWT and
 * {@code form_post} response mode — those are this seam's details, hidden from the callback flow.
 *
 * <p>The concrete adapters ({@code GoogleSsoGateway}, {@code AppleSsoGateway}) exist but throw
 * {@link UnsupportedOperationException} until client credentials ship (S5); {@code RealSsoGateway}
 * composes them into the {@link SsoGateway} the edge injects under {@code @Profile("sso")}.
 */
interface SsoProviderClient {

	/** The provider this client integrates. */
	SsoProvider provider();

	/** The provider's authorize URL for the given challenge (see {@link SsoGateway#authorizationRequest}). */
	URI authorizationRequest(SsoAuthorizationChallenge challenge, URI redirectUri);

	/** Exchange the code (+ PKCE verifier) for a verified identity (see {@link SsoGateway#exchangeCode}). */
	ExternalIdentity exchangeCode(String code, String codeVerifier, URI redirectUri);
}
