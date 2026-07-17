package ai.riviera.platform;

import java.net.URI;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit spec for the {@code sso}-profile real adapters (S4 #112, AC-5): both {@link GoogleSsoGateway} and
 * {@link AppleSsoGateway} throw {@link UnsupportedOperationException} until credentials ship (S5, #116),
 * and {@link RealSsoGateway} dispatches to them by provider — so activating the real profile without S5
 * fails loudly, with no silent fallback to the mock.
 */
class RealSsoGatewayTest {

	private static final URI CALLBACK = URI.create("https://app.example/api/auth/sso/google/callback");
	private static final SsoAuthorizationChallenge CHALLENGE = new SsoAuthorizationChallenge("state", "challenge");

	@Test
	void googleAndAppleAdaptersThrowUnsupportedUntilCredentialsShip() {
		GoogleSsoGateway google = new GoogleSsoGateway();
		AppleSsoGateway apple = new AppleSsoGateway();

		assertThatThrownBy(() -> google.authorizationRequest(CHALLENGE, CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> google.exchangeCode("code", "verifier", CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> apple.authorizationRequest(CHALLENGE, CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> apple.exchangeCode("code", "verifier", CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
	}

	@Test
	void realGatewayDispatchesToTheProviderAdapterWithNoMockFallback() {
		RealSsoGateway gateway = new RealSsoGateway(List.of(new GoogleSsoGateway(), new AppleSsoGateway()));

		assertThatThrownBy(() -> gateway.exchangeCode(SsoProvider.GOOGLE, "code", "verifier", CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
		assertThatThrownBy(() -> gateway.authorizationRequest(SsoProvider.APPLE, CHALLENGE, CALLBACK))
				.isInstanceOf(UnsupportedOperationException.class);
	}
}
