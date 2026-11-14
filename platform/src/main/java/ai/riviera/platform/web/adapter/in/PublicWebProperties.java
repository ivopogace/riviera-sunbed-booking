package ai.riviera.platform.web.adapter.in;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The public face of the deployment from {@code riviera.web.*}: {@code publicOrigin} is the origin every absolute
 * URL a crawler sees is built on, never the request's {@code Host}; blank means none is configured. A set value must
 * be a bare {@code https} origin or the boot aborts. {@code robots.disallowAll} shuts every crawler out of a
 * non-production deployment. Operator guide: {@code docs/deploy/cd-pipeline.md}.
 */
@ConfigurationProperties("riviera.web")
record PublicWebProperties(@DefaultValue("") String publicOrigin, @DefaultValue Robots robots) {

	private static final String HTTPS = "https";

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
		boolean bare = HTTPS.equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
				&& authority.equals(uri.getRawAuthority()) && uri.getRawPath().isEmpty() && uri.getRawQuery() == null
				&& uri.getRawFragment() == null;
		if (!bare) {
			throw invalid();
		}
		return HTTPS + "://" + authority;
	}

	private static IllegalArgumentException invalid() {
		return new IllegalArgumentException("riviera.web.public-origin (RIVIERA_PUBLIC_ORIGIN) must be a bare https "
				+ "origin such as https://example.com: no path, query, fragment or user info");
	}

	/** {@code robots.txt}'s posture: {@code disallowAll} answers {@code Disallow: /} to every agent. */
	record Robots(@DefaultValue("false") boolean disallowAll) {
	}
}
