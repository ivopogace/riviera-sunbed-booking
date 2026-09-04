package ai.riviera.platform;

import java.net.URI;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Platform-edge port for the OIDC Authorization Code + PKCE dance with an external identity provider
 * (design D-3/D-4). This is <strong>authentication machinery</strong>, so it lives at the
 * application edge (the root package) alongside {@code SecurityConfig}/{@code AuthController}, never
 * inside a domain module (RV-BE-11) — the {@code customer} module only owns the resulting
 * account identity ({@code SsoAccountProvisioning}).
 *
 * <p>Two moves, both completed server-side so tokens never reach browser JS:
 * <ol>
 *   <li>{@link #authorizationRequest} — build the provider's authorize URL for a generated
 *       {@link SsoAuthorizationChallenge} (state + PKCE {@code code_challenge}); the edge 302-redirects
 *       the browser to it.</li>
 *   <li>{@link #exchangeCode} — swap the returned authorization {@code code} (+ the PKCE
 *       {@code code_verifier}) for a verified {@link ExternalIdentity}.</li>
 * </ol>
 *
 * <p>Exactly one implementation is active per profile (mirroring {@code StubPaymentGateway} vs
 * {@code StripePaymentGateway}): the default {@code MockSsoGateway} ({@code @Profile("!sso")}) plays a
 * cooperative IdP with canned identities; under {@code @Profile("sso")} the real per-provider adapters
 * (S5) throw {@link UnsupportedOperationException} until client credentials ship — activating the
 * real profile without S5 fails loudly, never silently falling back to the mock.
 */
public interface SsoGateway {

	/** The provider's authorize URL to redirect the browser to, carrying the state + PKCE challenge. */
	URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri);

	/** Exchange the authorization code (+ PKCE verifier) for the provider-verified external identity. */
	ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, URI redirectUri);
}
