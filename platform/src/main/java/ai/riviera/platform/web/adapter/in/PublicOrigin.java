package ai.riviera.platform.web.adapter.in;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The public origin ({@code riviera.web.public-origin}, env {@code RIVIERA_PUBLIC_ORIGIN}) every absolute URL
 * the server writes is built on, never the request's {@code Host}, which a client controls. Unset, no absolute
 * URL is built; a value that is not a bare {@code http(s)://host[:port]} fails startup.
 */
final class PublicOrigin {

	private static final Logger log = LoggerFactory.getLogger(PublicOrigin.class);
	/** The property the origin is configured by; its env twin is {@code RIVIERA_PUBLIC_ORIGIN}. */
	static final String PROPERTY = "riviera.web.public-origin";

	private final String origin;

	PublicOrigin(String configured) {
		this.origin = validated(configured.strip());
		if (origin.isEmpty()) {
			log.warn("{} is unset: link previews carry no canonical, og:url, og:image or hreflang", PROPERTY);
		}
	}

	/** {@code path} (absolute, leading {@code /}) on the public origin, or empty when none is configured. */
	Optional<String> absolute(String path) {
		return origin.isEmpty() ? Optional.empty() : Optional.of(origin + path);
	}

	private static String validated(String configured) {
		if (configured.isEmpty()) {
			return "";
		}
		String bare = configured.endsWith("/") ? configured.substring(0, configured.length() - 1) : configured;
		try {
			URI uri = new URI(bare);
			boolean web = "https".equals(uri.getScheme()) || "http".equals(uri.getScheme());
			if (web && uri.getHost() != null && uri.getRawUserInfo() == null && uri.getRawPath().isEmpty()
					&& uri.getRawQuery() == null && uri.getRawFragment() == null) {
				return bare;
			}
		}
		catch (URISyntaxException malformed) {
			throw refused(configured, malformed);
		}
		throw refused(configured, null);
	}

	private static IllegalStateException refused(String configured, Exception cause) {
		return new IllegalStateException(PROPERTY + " must be a bare http(s)://host[:port] origin, got '"
				+ configured + "'", cause);
	}
}
