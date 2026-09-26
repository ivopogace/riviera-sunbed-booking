package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Mock {@link SsoGateway} under {@code @Profile("!sso")}, so exactly one gateway bean exists: this,
 * or {@code RealSsoGateway} under {@code sso}; {@code MockSsoProdGuard} bars it from {@code prod}.
 * A cooperative IdP with canned, verified identities (design D-4), like {@code StubPaymentGateway},
 * so "Continue with Google/Apple" demos with no external credentials: {@link #authorizationRequest}
 * sends the browser to {@code MockSsoIdpController}, which redirects to the real callback.
 * Identities are fixed per provider, so a repeat sign-in reuses its account. Package-private (#11).
 */
@Component
@Profile("!sso")
class MockSsoGateway implements SsoGateway {

	/** Path the mock IdP serves; {@code MockSsoIdpController} handles it. */
	static final String MOCK_IDP_PATH = "/api/auth/sso/mock/{provider}/authorize";
	static final String STATE_PARAM = "state";
	static final String REDIRECT_URI_PARAM = "redirect_uri";

	@Override
	public URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri) {
		// Point at the in-app mock IdP on the same host as the callback (which the edge built from the
		// request), carrying the state to echo and the callback to return to — the real redirect dance.
		return UriComponentsBuilder.fromUri(redirectUri)
				.replacePath(MOCK_IDP_PATH.replace("{provider}", SsoProviders.slug(provider)))
				.replaceQuery(null)
				.queryParam(STATE_PARAM, challenge.state())
				.queryParam(REDIRECT_URI_PARAM, redirectUri.toString())
				.build()
				.toUri();
	}

	@Override
	public ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, URI redirectUri) {
		// A cooperative mock: the code/verifier plumbing is exercised by the flow, but the mock returns the
		// provider's canned verified identity rather than calling a real token endpoint.
		return switch (provider) {
			case GOOGLE -> new ExternalIdentity(SsoProvider.GOOGLE, "google-mock-subject-001", "google.tourist@example.com");
			case APPLE -> new ExternalIdentity(SsoProvider.APPLE, "apple-mock-subject-001", "apple.tourist@example.com");
		};
	}
}
