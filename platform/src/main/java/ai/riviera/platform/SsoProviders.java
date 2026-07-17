package ai.riviera.platform;

import java.util.Locale;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Edge helper mapping between the URL provider <em>slug</em> ({@code google}/{@code apple}) and the
 * {@code customer::vocabulary} {@link SsoProvider} enum (S4, epic #108). Parsing an HTTP path segment is
 * an edge concern, not domain vocabulary, so it lives at the root package with the SSO machinery.
 *
 * <p>An unknown slug is a generic {@link IllegalArgumentException} → {@code 400 INVALID_REQUEST} via the
 * central {@code ApiErrorHandler} (the message is not leaked to the client).
 */
final class SsoProviders {

	private SsoProviders() {
	}

	static SsoProvider parse(String slug) {
		try {
			return SsoProvider.valueOf(slug.toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e) {
			throw new IllegalArgumentException("unknown SSO provider");
		}
	}

	static String slug(SsoProvider provider) {
		return provider.name().toLowerCase(Locale.ROOT);
	}
}
