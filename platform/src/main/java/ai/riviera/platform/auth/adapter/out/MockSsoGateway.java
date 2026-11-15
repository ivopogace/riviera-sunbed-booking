package ai.riviera.platform.auth.adapter.out;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.auth.application.ExternalIdentity;
import ai.riviera.platform.auth.application.SsoAuthorizationChallenge;
import ai.riviera.platform.auth.application.SsoGateway;
import ai.riviera.platform.auth.application.SsoProviders;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * Mock {@link SsoGateway} under {@code @Profile("!sso")} ({@code RealSsoGateway} under {@code sso};
 * {@code MockSsoProdGuard} refuses it without {@code demo}): a cooperative IdP with one canned, verified identity per
 * provider (design D-4), the same whichever audience asks, as one Google account may be a tourist and an operator.
 * {@code MockSsoIdpController} echoes the nonce inside its code ({@link #mockCode}), the stand-in for the ID token's
 * {@code nonce} claim, which {@link #exchangeCode} checks. Package-private (#11).
 */
@Component
@Profile("!sso")
class MockSsoGateway implements SsoGateway {

	/** Path the mock IdP serves; {@code MockSsoIdpController} handles it. */
	static final String MOCK_IDP_PATH = "/api/auth/sso/mock/{provider}/authorize";
	static final String STATE_PARAM = "state";
	static final String NONCE_PARAM = "nonce";
	static final String REDIRECT_URI_PARAM = "redirect_uri";

	/** The code the mock IdP issues for {@code provider}, carrying the authorize request's {@code nonce}. */
	static String mockCode(SsoProvider provider, String nonce) {
		return "mock-" + SsoProviders.slug(provider) + "." + nonce;
	}

	@Override
	public URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri) {
		return UriComponentsBuilder.fromUri(redirectUri)
				.replacePath(MOCK_IDP_PATH.replace("{provider}", SsoProviders.slug(provider)))
				.replaceQuery(null)
				.queryParam(STATE_PARAM, challenge.state())
				.queryParam(NONCE_PARAM, challenge.nonce())
				.queryParam(REDIRECT_URI_PARAM, redirectUri.toString())
				.build()
				.toUri();
	}

	@Override
	public boolean cooperative() {
		return true;
	}

	@Override
	public ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, String expectedNonce,
			URI redirectUri) {
		if (!mockCode(provider, expectedNonce).equals(code)) {
			throw new InvalidApiRequestException("SSO nonce mismatch");
		}
		String issuer = SsoProviders.issuer(provider);
		return switch (provider) {
			case GOOGLE -> new ExternalIdentity(provider, issuer, "google-mock-subject-001", "google.tourist@example.com");
			case APPLE -> new ExternalIdentity(provider, issuer, "apple-mock-subject-001", "apple.tourist@example.com");
		};
	}
}
