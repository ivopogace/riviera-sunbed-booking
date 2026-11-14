package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The only URLs an SNS message may steer this server to fetch: https on the default port, an exact
 * allowlisted host, no user info. A signing cert also needs a {@code .crt} path and no query. The cert URL
 * arrives before the message is verified, so this is the SSRF guard (RESPONSIBILITIES.md §notification).
 */
record SnsEndpointPolicy(List<String> signingCertHosts, List<String> subscribeHosts) {

	static final String SCALEWAY_FR_PAR_CERT_HOST = "messaging.s3.fr-par.scw.cloud";
	static final String SCALEWAY_FR_PAR_SUBSCRIBE_HOST = "sns.mnq.fr-par.scaleway.com";

	private static final String HTTPS = "https";
	private static final String CERT_SUFFIX = ".crt";

	SnsEndpointPolicy {
		signingCertHosts = lowerCased(signingCertHosts);
		subscribeHosts = lowerCased(subscribeHosts);
	}

	static SnsEndpointPolicy defaults() {
		return new SnsEndpointPolicy(List.of(SCALEWAY_FR_PAR_CERT_HOST), List.of(SCALEWAY_FR_PAR_SUBSCRIBE_HOST));
	}

	Optional<URI> signingCertUri(String url) {
		return httpsOn(url, signingCertHosts)
				.filter(uri -> uri.getRawQuery() == null && uri.getRawPath() != null
						&& uri.getRawPath().endsWith(CERT_SUFFIX));
	}

	Optional<URI> subscribeUri(String url) {
		return httpsOn(url, subscribeHosts);
	}

	private static Optional<URI> httpsOn(String url, List<String> hosts) {
		if (url == null) {
			return Optional.empty();
		}
		URI uri;
		try {
			uri = new URI(url);
		}
		catch (URISyntaxException e) {
			return Optional.empty();
		}
		boolean trusted = HTTPS.equalsIgnoreCase(uri.getScheme()) && uri.getRawUserInfo() == null
				&& uri.getPort() == -1 && uri.getRawFragment() == null && uri.getHost() != null
				&& hosts.contains(uri.getHost().toLowerCase(Locale.ROOT));
		return trusted ? Optional.of(uri) : Optional.empty();
	}

	private static List<String> lowerCased(List<String> hosts) {
		return hosts == null ? List.of()
				: hosts.stream().map(String::strip).filter(h -> !h.isEmpty()).map(h -> h.toLowerCase(Locale.ROOT))
						.toList();
	}
}
