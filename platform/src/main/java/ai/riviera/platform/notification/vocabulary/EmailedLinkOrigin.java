package ai.riviera.platform.notification.vocabulary;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The one rule for the deployed origin every emailed link is built on, bound under each consumer's own key: an
 * {@code http}/{@code https} URL with a host, no trailing dot (underscores between letters or digits allowed), a port
 * in 1..65535 if given (a bare {@code :} fails), an optional path, no user info, query, fragment or percent-escape;
 * stripped, trailing slashes trimmed. A rejection names the key and variable, never the value, which may carry
 * credentials into the boot log. Placement: RESPONSIBILITIES.md §notification.
 */
public final class EmailedLinkOrigin {

	private static final Set<String> SCHEMES = Set.of("http", "https");

	/**
	 * Underscores between letters or digits. An authority holding one is not a {@link URI} server authority, so it is
	 * re-parsed with them read as letters: it passes when that hostname does, and an edge or lone {@code _} fails.
	 */
	private static final Pattern INNER_UNDERSCORES = Pattern.compile("(?<=[A-Za-z0-9])_+(?=[A-Za-z0-9])");

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
			throw new IllegalArgumentException(key + " is not an http or https URL with a host, such as "
					+ "https://app.example (the rule: RIVIERA_RECOVERY_LINK_BASE_URL in docs/deploy/cd-pipeline.md): set "
					+ variable);
		}
		return trimTrailingSlashes(stripped);
	}

	private static boolean isOrigin(String value) {
		URI parsed = parse(value);
		if (parsed == null || value.contains("%")) {
			return false;
		}
		String authority = parsed.getRawAuthority();
		if (parsed.getScheme() == null || !SCHEMES.contains(parsed.getScheme().toLowerCase(Locale.ROOT))
				|| authority == null || authority.contains("@") || authority.endsWith(":")
				|| parsed.getRawQuery() != null || parsed.getRawFragment() != null) {
			return false;
		}
		URI server = parsed.getHost() != null ? parsed
				: parse(parsed.getScheme() + "://" + INNER_UNDERSCORES.matcher(authority).replaceAll("a"));
		return server != null && server.getHost() != null && !server.getHost().endsWith(".")
				&& (server.getPort() == -1 || isPort(server.getPort()));
	}

	private static URI parse(String value) {
		try {
			return new URI(value);
		} catch (URISyntaxException e) {
			return null;
		}
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
