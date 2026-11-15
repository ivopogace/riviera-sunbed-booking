package ai.riviera.platform.web.adapter.in;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The public face of the deployment from {@code riviera.web.*}: {@code publicOrigin} is the origin every absolute
 * URL a crawler sees is built on, never the request's {@code Host}; blank means none is configured. A set value must
 * be a bare {@code https} origin, or {@code http} on a loopback host (the mail links' local run), or the boot aborts.
 * {@code robots.disallowAll} shuts every crawler out of a non-production deployment. Operator guide:
 * {@code docs/deploy/cd-pipeline.md}.
 */
@ConfigurationProperties("riviera.web")
record PublicWebProperties(@DefaultValue("") String publicOrigin, @DefaultValue Robots robots) {

	private static final String HTTPS = "https";

	private static final String HTTP = "http";

	/** Hosts no crawler reaches, so the local {@code mailer} run may share the one variable over plain http. */
	private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

	/** Validated by hand: no JSR-303 implementation is on the classpath, so an annotation would check nothing. */
	PublicWebProperties {
		publicOrigin = normalized(publicOrigin.strip());
	}

	/** The configured origin as {@code https://host[:port]}, or empty when none is configured. */
	Optional<String> origin() {
		return publicOrigin.isEmpty() ? Optional.empty() : Optional.of(publicOrigin);
	}

	/** {@code path} (leading {@code /}) on the configured origin, or empty when none is configured. */
	Optional<String> absolute(String path) {
		return origin().map(origin -> origin + path);
	}

	private static String normalized(String value) {
		if (value.isEmpty()) {
			return value;
		}
		String origin = value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
		URI uri;
		try {
			uri = new URI(origin);
		} catch (URISyntaxException _) {
			throw invalid();
		}
		String authority = uri.getHost() + (uri.getPort() < 0 ? "" : ":" + uri.getPort());
		String scheme = scheme(uri);
		boolean bare = scheme != null && uri.getHost() != null && authority.equals(uri.getRawAuthority())
				&& uri.getRawPath().isEmpty() && uri.getRawQuery() == null && uri.getRawFragment() == null;
		if (!bare) {
			throw invalid();
		}
		return scheme + "://" + authority;
	}

	/** {@code https}, or {@code http} on a loopback host; null for anything else. */
	private static String scheme(URI uri) {
		if (HTTPS.equalsIgnoreCase(uri.getScheme())) {
			return HTTPS;
		}
		boolean loopback = uri.getHost() != null && LOOPBACK_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT));
		return HTTP.equalsIgnoreCase(uri.getScheme()) && loopback ? HTTP : null;
	}

	private static IllegalArgumentException invalid() {
		return new IllegalArgumentException("riviera.web.public-origin (RIVIERA_PUBLIC_ORIGIN) must be a bare https "
				+ "origin such as https://example.com (http only on a loopback host): no path, query, fragment or "
				+ "user info");
	}

	/** {@code robots.txt}'s posture: {@code disallowAll} answers {@code Disallow: /} to every agent. */
	record Robots(@DefaultValue("false") boolean disallowAll) {
	}
}
