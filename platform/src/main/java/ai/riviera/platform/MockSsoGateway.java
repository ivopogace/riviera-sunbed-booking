package ai.riviera.platform;

import java.net.URI;
import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Default-profile ({@code @Profile("!sso")}) mock {@link SsoGateway} that plays a cooperative identity
 * provider with canned, verified identities (S4, epic #108, design D-4) — the same pattern as
 * {@code StubPaymentGateway}. It makes "Continue with Google/Apple" demoable end-to-end with zero
 * external credentials: {@link #authorizationRequest} points the browser at the in-app mock IdP endpoint
 * ({@code MockSsoIdpController}), which redirects back to the real callback, and {@link #exchangeCode}
 * returns the provider's canned identity.
 *
 * <p>{@code @Profile("!sso")} so exactly one {@link SsoGateway} bean exists: the mock when {@code sso} is
 * absent, {@code RealSsoGateway} when it is present. {@code MockSsoProdGuard} additionally forbids this
 * mock from ever running under the {@code prod} profile. Identities are <strong>deterministic per
 * provider</strong>, so a second "Continue with Google" reuses the same account (a distinct provider is a
 * distinct account). Package-private (invariant #11).
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
				.replacePath(MOCK_IDP_PATH.replace("{provider}", providerSlug(provider)))
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

	private static String providerSlug(SsoProvider provider) {
		return provider.name().toLowerCase(Locale.ROOT);
	}
}
