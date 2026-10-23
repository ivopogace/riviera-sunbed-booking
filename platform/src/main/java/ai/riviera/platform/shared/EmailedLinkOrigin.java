package ai.riviera.platform.shared;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The one rule for the deployed origin every emailed link is built on, bound under each consumer's own key: an
 * absolute {@code http}/{@code https} URL with a host (registry-style {@code riviera_backend:8080} too), no user
 * info, query or fragment; stripped, trailing slashes trimmed. A rejection names the key and variable, never the
 * value, which may carry credentials into the boot log. Admission and rationale: RESPONSIBILITIES.md §shared.
 */
public final class EmailedLinkOrigin {

	private static final Set<String> SCHEMES = Set.of("http", "https");

	/** A registry-style {@code host[:port]}, which {@link URI#getHost()} reports as null (underscores). */
	private static final Pattern REGISTRY_AUTHORITY = Pattern.compile("[A-Za-z0-9._~-]+(:\\d{1,5})?");

	private EmailedLinkOrigin() {
	}

	/** {@code value} validated and normalised; a rejection names {@code key} and {@code variable}, never the value. */
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
					+ "user info, query or fragment (e.g. https://app.example): set " + variable);
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
		return parsed.getScheme() != null && SCHEMES.contains(parsed.getScheme().toLowerCase(Locale.ROOT))
				&& !parsed.isOpaque() && authority != null && !authority.contains("@")
				&& (parsed.getHost() != null || REGISTRY_AUTHORITY.matcher(authority).matches())
				&& parsed.getRawQuery() == null && parsed.getRawFragment() == null;
	}

	private static String trimTrailingSlashes(String value) {
		int end = value.length();
		while (value.charAt(end - 1) == '/') {
			end--;
		}
		return value.substring(0, end);
	}
}
