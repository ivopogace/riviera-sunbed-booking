package ai.riviera.platform.auth.application;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * Edge helper mapping a provider to its URL <em>slug</em> ({@code google}/{@code apple}) and its OIDC issuer.
 * Parsing a path segment is an edge concern, so it lives in {@code auth} with the SSO machinery. An unknown slug is
 * an {@link InvalidApiRequestException} ({@code 400 INVALID_REQUEST}, message not leaked).
 */
public final class SsoProviders {

	private static final String GOOGLE_ISSUER = "https://accounts.google.com";
	private static final String APPLE_ISSUER = "https://appleid.apple.com";

	private SsoProviders() {
	}

	public static SsoProvider parse(String slug) {
		try {
			return SsoProvider.valueOf(slug.toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e) {
			throw new InvalidApiRequestException("unknown SSO provider");
		}
	}

	public static String slug(SsoProvider provider) {
		return provider.name().toLowerCase(Locale.ROOT);
	}

	/** The {@code iss} the provider's ID tokens carry, the key an operator's link is stored under. */
	public static String issuer(SsoProvider provider) {
		return switch (provider) {
			case GOOGLE -> GOOGLE_ISSUER;
			case APPLE -> APPLE_ISSUER;
		};
	}

	/** The provider whose ID tokens carry this issuer. */
	public static Optional<SsoProvider> forIssuer(String issuer) {
		return Arrays.stream(SsoProvider.values()).filter(provider -> issuer(provider).equals(issuer)).findFirst();
	}
}
