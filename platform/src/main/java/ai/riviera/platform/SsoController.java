package ai.riviera.platform;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * The platform-edge SSO redirect/callback flow (S4, epic #108, design D-3): OIDC Authorization Code +
 * PKCE completed <strong>server-side</strong>, so tokens never reach browser JS and a successful callback
 * establishes the same {@code SESSION} cookie as form login. Login machinery stays at the edge (RV-BE-11);
 * the {@code customer} module only resolves the resulting account identity ({@link SsoAccountProvisioning}).
 *
 * <p><strong>authorize</strong> ({@code GET /api/auth/sso/{provider}/authorize}): mint a {@code state}
 * nonce + PKCE {@code code_verifier}, stash both in the HTTP session, and 302-redirect the browser to the
 * provider's authorize URL (via {@link SsoGateway}). <strong>callback</strong>
 * ({@code GET /api/auth/sso/{provider}/callback}): validate {@code state} against the session (single-use
 * — CSRF / code-injection defence, AC-7), exchange the code for a verified {@link ExternalIdentity},
 * resolve-or-create the account, establish the session, and 302 to the SPA root.
 *
 * <p>Both endpoints are anonymous (permit-all in {@code SecurityConfig}) and behind the
 * {@code RateLimitFilter} per-IP budget (AC-8). GETs are never CSRF-challenged; the {@code state} nonce is
 * the callback's forgery defence. Package-private (invariant #11).
 */
@RestController
class SsoController {

	private static final String CUSTOMER_ROLE = "ROLE_CUSTOMER";
	private static final String CALLBACK_PATH_TEMPLATE = "/api/auth/sso/%s/callback";
	/** Where a completed sign-in lands: the SPA root, which re-reads {@code /api/auth/me} and shows signed-in. */
	private static final String POST_LOGIN_REDIRECT = "/";

	/** Per-request round-trip material, held server-side in the session between authorize and callback. */
	private static final String STATE_ATTR = "sso.state";
	private static final String VERIFIER_ATTR = "sso.codeVerifier";
	private static final String PROVIDER_ATTR = "sso.provider";

	/** 256 bits of entropy for the state nonce and the PKCE code_verifier. */
	private static final int TOKEN_BYTES = 32;

	private final SsoGateway ssoGateway;
	private final SsoAccountProvisioning ssoAccounts;
	private final SecurityContextRepository securityContextRepository;
	private final SecureRandom secureRandom = new SecureRandom();

	SsoController(SsoGateway ssoGateway, SsoAccountProvisioning ssoAccounts,
			SecurityContextRepository securityContextRepository) {
		this.ssoGateway = ssoGateway;
		this.ssoAccounts = ssoAccounts;
		this.securityContextRepository = securityContextRepository;
	}

	@GetMapping("/api/auth/sso/{provider}/authorize")
	ResponseEntity<Void> authorize(@PathVariable String provider, HttpServletRequest request) {
		SsoProvider parsed = SsoProviders.parse(provider);
		String state = randomToken();
		String codeVerifier = randomToken();

		HttpSession session = request.getSession(true);
		session.setAttribute(STATE_ATTR, state);
		session.setAttribute(VERIFIER_ATTR, codeVerifier);
		session.setAttribute(PROVIDER_ATTR, parsed.name());

		URI authorizeUrl = ssoGateway.authorizationRequest(parsed,
				new SsoAuthorizationChallenge(state, pkceChallenge(codeVerifier)), callbackUri(request, parsed));
		return redirectTo(authorizeUrl);
	}

	@GetMapping("/api/auth/sso/{provider}/callback")
	ResponseEntity<Void> callback(@PathVariable String provider,
			@RequestParam("code") String code, @RequestParam("state") String state,
			HttpServletRequest request, HttpServletResponse response) {
		SsoProvider parsed = SsoProviders.parse(provider);
		// Validate + single-use-consume the state BEFORE any account write or session — a bad/missing
		// state is a 400 with no account created and no session established (AC-7).
		String codeVerifier = consumeValidatedChallenge(request, parsed, state);

		ExternalIdentity identity =
				ssoGateway.exchangeCode(parsed, code, codeVerifier, callbackUri(request, parsed));
		// Resolve-or-create the account (find-or-create by verified email, auto-link); the session is keyed
		// by the account email (principal name), exactly like password login, so CurrentCustomer resolves it.
		ssoAccounts.resolveOrCreate(identity.provider(), identity.subject(), identity.email());
		Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
				identity.email(), null, List.of(new SimpleGrantedAuthority(CUSTOMER_ROLE)));
		SessionAuthentication.establish(securityContextRepository, authentication, request, response);
		return redirectTo(URI.create(POST_LOGIN_REDIRECT));
	}

	/**
	 * Validate the returned {@code state} against the session's, confirm the provider matches, and return
	 * the stored PKCE verifier — clearing all three attributes first so a callback cannot be replayed
	 * (single-use). Any mismatch or missing attribute is a generic {@link IllegalArgumentException} →
	 * {@code 400 INVALID_REQUEST}, with nothing written.
	 */
	private static String consumeValidatedChallenge(HttpServletRequest request, SsoProvider provider, String state) {
		HttpSession session = request.getSession(false);
		if (session == null) {
			throw new IllegalArgumentException("no SSO authorization in progress");
		}
		Object expectedState = session.getAttribute(STATE_ATTR);
		Object sessionProvider = session.getAttribute(PROVIDER_ATTR);
		Object verifier = session.getAttribute(VERIFIER_ATTR);
		session.removeAttribute(STATE_ATTR);
		session.removeAttribute(VERIFIER_ATTR);
		session.removeAttribute(PROVIDER_ATTR);
		if (!(expectedState instanceof String expected) || !constantTimeEquals(expected, state)
				|| !provider.name().equals(sessionProvider) || !(verifier instanceof String codeVerifier)) {
			throw new IllegalArgumentException("invalid SSO state");
		}
		return codeVerifier;
	}

	private String randomToken() {
		byte[] bytes = new byte[TOKEN_BYTES];
		secureRandom.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	/** PKCE S256 challenge: base64url(SHA-256(code_verifier)) with no padding (RFC 7636). */
	private static String pkceChallenge(String codeVerifier) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 unavailable", e); // never on a standard JVM
		}
	}

	/** This app's own callback URL for the provider, derived from the current request (absolute). */
	private static URI callbackUri(HttpServletRequest request, SsoProvider provider) {
		return ServletUriComponentsBuilder.fromRequestUri(request)
				.replacePath(CALLBACK_PATH_TEMPLATE.formatted(SsoProviders.slug(provider)))
				.replaceQuery(null)
				.build()
				.toUri();
	}

	private static boolean constantTimeEquals(String a, String b) {
		return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
	}

	private static ResponseEntity<Void> redirectTo(URI location) {
		return ResponseEntity.status(HttpStatus.FOUND).location(location).build();
	}
}
