package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Real Google "Sign in with Google" adapter (plain OIDC) — exists but is <strong>not implemented</strong>
 * until the Google Cloud client credentials ship (S5, #116). Under {@code @Profile("sso")} it throws
 * {@link UnsupportedOperationException} on any use, so activating the real profile without S5 fails
 * loudly rather than silently falling back to the mock (design D-4). Package-private (invariant #11).
 */
@Component
@Profile("sso")
class GoogleSsoGateway implements SsoProviderClient {

	private static final String NOT_IMPLEMENTED = "Google SSO not implemented — awaiting client credentials (S5, #116)";

	@Override
	public SsoProvider provider() {
		return SsoProvider.GOOGLE;
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
