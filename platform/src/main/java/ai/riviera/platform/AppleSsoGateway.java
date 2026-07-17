package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Real "Sign in with Apple" adapter — exists but is <strong>not implemented</strong> until the Apple
 * Developer credentials ship (S5, #116). Apple needs an ES256 client-secret JWT and {@code form_post}
 * response mode; those details land in S5. Under {@code @Profile("sso")} it throws
 * {@link UnsupportedOperationException} on any use, so activating the real profile without S5 fails
 * loudly rather than silently falling back to the mock (design D-4). Package-private (invariant #11).
 */
@Component
@Profile("sso")
class AppleSsoGateway implements SsoProviderClient {

	private static final String NOT_IMPLEMENTED = "Apple SSO not implemented — awaiting client credentials (S5, #116)";

	@Override
	public SsoProvider provider() {
		return SsoProvider.APPLE;
	}

	@Override
	public URI authorizationRequest(SsoAuthorizationChallenge challenge, URI redirectUri) {
		throw new UnsupportedOperationException(NOT_IMPLEMENTED);
	}

	@Override
	public ExternalIdentity exchangeCode(String code, String codeVerifier, URI redirectUri) {
		throw new UnsupportedOperationException(NOT_IMPLEMENTED);
	}
}
