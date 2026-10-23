package ai.riviera.platform.notification.vocabulary;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The one rule for the deployed origin every emailed link is built on, bound under each consumer's own key: an
 * absolute {@code http}/{@code https} URL with a host (registry-style {@code riviera_backend:8080} too), any port
 * within 1..65535, no user info, query, fragment or percent-escape; stripped, trailing slashes trimmed. A rejection
 * names the key and variable, never the value, which may carry credentials into the boot log. Placement:
 * RESPONSIBILITIES.md §notification.
 */
public final class EmailedLinkOrigin {

	private static final Set<String> SCHEMES = Set.of("http", "https");

	private static final String LABEL = "[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?";

	/** An underscored {@code host[:port]}, the one authority {@link URI#getHost()} reports as null that may pass. */
	private static final Pattern REGISTRY_AUTHORITY =
			Pattern.compile("(?=[^:]*_)" + LABEL + "(?:\\." + LABEL + ")*(?::(\\d{1,5}))?");

	/** {@link URI} parses any digit run as a port, so the TCP range is bounded here. */
	private static final int MAX_PORT = 65_535;

	private EmailedLinkOrigin() {
	}

	/** {@code value} stripped and trailing-slash-trimmed; a rejection names {@code key} and {@code variable} only. */
	public static String require(String key, String variable, String value) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(key + " must be set: set " + variable
					+ " to the absolute origin every emailed link is built on");
		}
		if (value.contains("${")) {
			throw new IllegalArgumentException(key + " is unresolved: set " + variable);
		}
		String stripped = value.strip();
		if (!isOrigin(stripped)) {
			throw new IllegalArgumentException(key + " must be an absolute http or https URL with a host and no "
					+ "user info, query, fragment or percent-escape (e.g. https://app.example): set " + variable);
		}
		return trimTrailingSlashes(stripped);
	}

	private static boolean isOrigin(String value) {
		URI parsed;
		try {
			parsed = new URI(value);
		} catch (URISyntaxException e) {
			return false;
		}
		String authority = parsed.getRawAuthority();
		if (parsed.getScheme() == null || !SCHEMES.contains(parsed.getScheme().toLowerCase(Locale.ROOT))
				|| authority == null || authority.contains("@") || parsed.getRawQuery() != null
				|| parsed.getRawFragment() != null || parsed.getRawPath().contains("%")) {
			return false;
		}
		if (parsed.getHost() != null) {
			return parsed.getPort() == -1 || isPort(parsed.getPort());
		}
		Matcher registry = REGISTRY_AUTHORITY.matcher(authority);
		return registry.matches() && (registry.group(1) == null || isPort(Integer.parseInt(registry.group(1))));
	}

	private static boolean isPort(int port) {
		return port >= 1 && port <= MAX_PORT;
	}

	private static String trimTrailingSlashes(String value) {
		int end = value.length();
		while (value.charAt(end - 1) == '/') {
			end--;
		}
		return value.substring(0, end);
	}
}
