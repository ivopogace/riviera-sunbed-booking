package ai.riviera.platform.auth.adapter.in;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import ai.riviera.platform.auth.application.ExternalIdentity;
import ai.riviera.platform.auth.application.SsoAuthorization;
import ai.riviera.platform.auth.application.SsoAuthorizationChallenge;
import ai.riviera.platform.auth.application.SsoGateway;
import ai.riviera.platform.auth.application.SsoProviders;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.shared.InvalidApiRequestException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * The OIDC round trip both audiences share (design D-3, #276): {@link #begin} mints state, PKCE verifier and nonce,
 * keeps them in one session-held {@link SsoAuthorization} and returns the provider's authorize URL; {@link #consume}
 * single-use-validates the callback's {@code state} against it (the forgery defence: GETs skip CSRF); {@link #exchange}
 * trades the code for the identity. One callback URL per provider: what it does is the record's, never the URL's.
 * Each controller builds its own over the {@link SsoGateway} bean, so a web slice needs no extra bean.
 */
final class SsoFlow {

	private static final String CALLBACK_PATH_TEMPLATE = "/api/auth/sso/%s/callback";
	private static final String AUTHORIZATION_ATTR = "sso.authorization";
	/** 256 bits of entropy for the state, the PKCE code_verifier and the nonce. */
	private static final int TOKEN_BYTES = 32;

	private final SsoGateway gateway;
	private final SecureRandom secureRandom = new SecureRandom();

	SsoFlow(SsoGateway gateway) {
		this.gateway = gateway;
	}

	/** Start a round trip, superseding any earlier one in this session; the authorize URL to send the browser to. */
	URI begin(HttpServletRequest request, SsoProvider provider, SsoAuthorization.Audience audience,
			SsoAuthorization.Intent intent, SsoAuthorization.Linking linking) {
		SsoAuthorization authorization = new SsoAuthorization(provider, audience, intent, randomToken(),
				randomToken(), randomToken(), linking);
		request.getSession(true).setAttribute(AUTHORIZATION_ATTR, authorization);
		return gateway.authorizationRequest(provider, new SsoAuthorizationChallenge(authorization.state(),
				pkceChallenge(authorization.codeVerifier()), authorization.nonce()), callbackUri(request, provider));
	}

	/**
	 * The round trip this callback completes, removed from the session first so it cannot be replayed. No record, another
	 * provider or another state is an {@link InvalidApiRequestException} ({@code 400}), with nothing written.
	 */
	SsoAuthorization consume(HttpServletRequest request, SsoProvider provider, String state) {
		HttpSession session = request.getSession(false);
		if (session == null) {
			throw new InvalidApiRequestException("no SSO authorization in progress");
		}
		Object held = session.getAttribute(AUTHORIZATION_ATTR);
		session.removeAttribute(AUTHORIZATION_ATTR);
		if (!(held instanceof SsoAuthorization authorization) || authorization.provider() != provider
				|| !constantTimeEquals(authorization.state(), state)) {
			throw new InvalidApiRequestException("invalid SSO state");
		}
		return authorization;
	}

	ExternalIdentity exchange(HttpServletRequest request, SsoAuthorization authorization, String code) {
		return gateway.exchangeCode(authorization.provider(), code, authorization.codeVerifier(), authorization.nonce(),
				callbackUri(request, authorization.provider()));
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
			throw new IllegalStateException("SHA-256 unavailable", e);
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
}
