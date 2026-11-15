package ai.riviera.platform.auth.adapter.out;

import java.net.URI;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.auth.application.ExternalIdentity;
import ai.riviera.platform.auth.application.SsoAuthorizationChallenge;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.shared.InvalidApiRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit spec for the default-profile {@link MockSsoGateway}: one verified, canned identity per provider under that
 * provider's issuer, an authorize URL on the callback host carrying state, nonce and the callback, and a refused
 * exchange when the code does not carry the authorize request's nonce (ASVS 10.5).
 */
class MockSsoGatewayTest {

	private static final URI GOOGLE_CALLBACK = URI.create("https://app.example/api/auth/sso/google/callback");

	private final MockSsoGateway gateway = new MockSsoGateway();

	@Test
	void exchangeReturnsAVerifiedCannedIdentityPerProvider() {
		ExternalIdentity google = gateway.exchangeCode(SsoProvider.GOOGLE,
				MockSsoGateway.mockCode(SsoProvider.GOOGLE, "n1"), "verifier", "n1", GOOGLE_CALLBACK);
		ExternalIdentity apple = gateway.exchangeCode(SsoProvider.APPLE,
				MockSsoGateway.mockCode(SsoProvider.APPLE, "n2"), "verifier", "n2",
				URI.create("https://app.example/api/auth/sso/apple/callback"));

		assertThat(google.provider()).isEqualTo(SsoProvider.GOOGLE);
		assertThat(google.issuer()).isEqualTo("https://accounts.google.com");
		assertThat(google.email()).isEqualTo("google.tourist@example.com");
		assertThat(apple.issuer()).isEqualTo("https://appleid.apple.com");
		assertThat(apple.subject())
				.as("a distinct provider is a distinct account").isNotEqualTo(google.subject());
	}

	@Test
	void aMismatchedNonceIsRefused() {
		String code = MockSsoGateway.mockCode(SsoProvider.GOOGLE, "the-authorize-nonce");

		assertThatThrownBy(() -> gateway.exchangeCode(SsoProvider.GOOGLE, code, "verifier", "another-nonce",
				GOOGLE_CALLBACK)).isInstanceOf(InvalidApiRequestException.class);
		assertThatThrownBy(() -> gateway.exchangeCode(SsoProvider.GOOGLE, "mock-google", "verifier",
				"the-authorize-nonce", GOOGLE_CALLBACK)).isInstanceOf(InvalidApiRequestException.class);
	}

	@Test
	void authorizationRequestTargetsTheMockIdpOnTheCallbackHostCarryingStateNonceAndRedirect() {
		URI authorize = gateway.authorizationRequest(SsoProvider.GOOGLE,
				new SsoAuthorizationChallenge("state-123", "challenge-abc", "nonce-xyz"), GOOGLE_CALLBACK);

		assertThat(authorize.getHost()).isEqualTo("app.example");
		assertThat(authorize.getPath()).isEqualTo("/api/auth/sso/mock/google/authorize");
		assertThat(authorize.getQuery()).contains("state=state-123").contains("nonce=nonce-xyz")
				.contains("redirect_uri=");
	}
}
