package ai.riviera.platform;

import java.net.URI;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
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
		// Build the callback target from THIS request's own origin (scheme/host/port/path) — NEVER from the
		// client-supplied redirect_uri — so this endpoint can never be turned into an open redirect. The
		// supplied redirect_uri is then required to equal that origin's callback, mimicking a real IdP's
		// registered-redirect-uri check (a mismatch is a 400 — invalid redirect_uri).
		URI ownCallback = ServletUriComponentsBuilder.fromRequestUri(request)
				.replacePath(CALLBACK_PATH_TEMPLATE.formatted(SsoProviders.slug(parsed)))
				.replaceQuery(null)
				.build()
				.toUri();
		requireMatchesOwnCallback(redirectUri, ownCallback);

		URI location = UriComponentsBuilder.fromUri(ownCallback)
				.queryParam(CODE_PARAM, MOCK_CODE_PREFIX + SsoProviders.slug(parsed))
				.queryParam(STATE_PARAM, state)
				.build()
				.toUri();
		return ResponseEntity.status(HttpStatus.FOUND).location(location).build();
	}

	/**
	 * The supplied {@code redirect_uri} must be exactly this app's own callback — scheme, host, port AND
	 * path (the earlier host+path-only guard missed scheme/port). Belt-and-braces: the Location is already
	 * built from the request origin above, so this only enforces the mock's IdP contract.
	 */
	private static void requireMatchesOwnCallback(URI redirectUri, URI ownCallback) {
		boolean matches = equalsIgnoreCase(redirectUri.getScheme(), ownCallback.getScheme())
				&& equalsIgnoreCase(redirectUri.getHost(), ownCallback.getHost())
				&& redirectUri.getPort() == ownCallback.getPort()
				&& ownCallback.getPath().equals(redirectUri.getPath());
		if (!matches) {
			throw new IllegalArgumentException("invalid redirect_uri");
		}
	}

	private static boolean equalsIgnoreCase(String a, String b) {
		return a == null ? b == null : a.equalsIgnoreCase(b);
	}
}
