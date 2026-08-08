package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for the default-profile {@link MockSsoGateway}: it returns a verified, canned,
 * deterministic identity per provider (so a repeat sign-in reuses the account and a different provider is
 * a different account), and its authorize URL targets the in-app mock IdP on the callback host, carrying
 * the state and the callback to return to.
 */
class MockSsoGatewayTest {

	private final MockSsoGateway gateway = new MockSsoGateway();

	@Test
	void exchangeReturnsAVerifiedCannedIdentityPerProvider() {
		ExternalIdentity google = gateway.exchangeCode(SsoProvider.GOOGLE, "mock-google", "verifier",
				URI.create("https://app.example/api/auth/sso/google/callback"));
		ExternalIdentity apple = gateway.exchangeCode(SsoProvider.APPLE, "mock-apple", "verifier",
				URI.create("https://app.example/api/auth/sso/apple/callback"));

		assertThat(google.provider()).isEqualTo(SsoProvider.GOOGLE);
		assertThat(google.email()).isEqualTo("google.tourist@example.com");
		assertThat(apple.provider()).isEqualTo(SsoProvider.APPLE);
		assertThat(apple.subject())
				.as("a distinct provider is a distinct account").isNotEqualTo(google.subject());
	}

	@Test
	void authorizationRequestTargetsTheMockIdpOnTheCallbackHostCarryingStateAndRedirect() {
		URI callback = URI.create("https://app.example/api/auth/sso/google/callback");

		URI authorize = gateway.authorizationRequest(SsoProvider.GOOGLE,
				new SsoAuthorizationChallenge("state-123", "challenge-abc"), callback);

		assertThat(authorize.getHost()).isEqualTo("app.example");
		assertThat(authorize.getPath()).isEqualTo("/api/auth/sso/mock/google/authorize");
		assertThat(authorize.getQuery()).contains("state=state-123").contains("redirect_uri=");
	}
}
