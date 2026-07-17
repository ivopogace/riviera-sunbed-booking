package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The in-app mock identity provider (S4, epic #108) — present only under {@code @Profile("!sso")} (and
 * forbidden in prod by {@code MockSsoProdGuard}). It plays the IdP's authorize step: the browser arrives
 * here from {@code MockSsoGateway#authorizationRequest}, and it immediately 302-redirects back to the
 * real callback with a canned authorization {@code code} and the echoed {@code state} — making the full
 * "button → redirect → IdP → callback → session" dance real and demoable with no external credentials.
 *
 * <p>The supplied {@code redirect_uri} is <strong>validated</strong> to be our own callback on the same
 * host before redirecting, so this can never be abused as an open redirect (defence-in-depth even though
 * it is non-prod). Package-private (invariant #11).
 */
@RestController
@Profile("!sso")
class MockSsoIdpController {

	private static final String CALLBACK_PATH_TEMPLATE = "/api/auth/sso/%s/callback";
	private static final String MOCK_CODE_PREFIX = "mock-";
	private static final String CODE_PARAM = "code";
	private static final String STATE_PARAM = "state";

	@GetMapping("/api/auth/sso/mock/{provider}/authorize")
	ResponseEntity<Void> authorize(@PathVariable String provider,
			@RequestParam(STATE_PARAM) String state,
			@RequestParam("redirect_uri") URI redirectUri,
			HttpServletRequest request) {
		SsoProvider parsed = SsoProviders.parse(provider);
		requireOwnCallback(parsed, redirectUri, request);

		URI callback = UriComponentsBuilder.fromUri(redirectUri)
				.replaceQuery(null)
				.queryParam(CODE_PARAM, MOCK_CODE_PREFIX + SsoProviders.slug(parsed))
				.queryParam(STATE_PARAM, state)
				.build()
				.toUri();
		return ResponseEntity.status(HttpStatus.FOUND).location(callback).build();
	}

	/** Only ever redirect back to this app's own {@code /api/auth/sso/{provider}/callback} (no open redirect). */
	private static void requireOwnCallback(SsoProvider provider, URI redirectUri, HttpServletRequest request) {
		String expectedPath = CALLBACK_PATH_TEMPLATE.formatted(SsoProviders.slug(provider));
		boolean sameHost = request.getServerName().equalsIgnoreCase(redirectUri.getHost());
		if (!expectedPath.equals(redirectUri.getPath()) || !sameHost) {
			throw new IllegalArgumentException("invalid redirect_uri");
		}
	}
}
