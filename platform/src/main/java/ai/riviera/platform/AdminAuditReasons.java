package ai.riviera.platform;

import java.util.regex.Pattern;

/**
 * The {@code X-Audit-Reason} request header and its sanitizer (#507). Any mutating
 * {@code /api/admin/**} request may carry free-text grounds for the action; the value is
 * client-supplied text, so before it is persisted (and later rendered in the admin console) it is
 * neutralized per {@code riviera-java-conventions} §10: runs of control characters — including the
 * CRLF a log-forging or header-splitting payload rides on — collapse to a single space, the result
 * is trimmed, a blank collapses to {@code null} (absent and empty are the same fact: no grounds
 * offered), and the length is capped at {@link #MAX_LENGTH}.
 */
final class AdminAuditReasons {

	/** The optional request header carrying an admin action's stated grounds. */
	static final String HEADER = "X-Audit-Reason";

	/** Longest reason persisted; anything beyond is truncated, not rejected — grounds are optional. */
	private static final int MAX_LENGTH = 500;

	private static final Pattern CONTROL_RUNS = Pattern.compile("\\p{Cntrl}+");

	private AdminAuditReasons() {
	}

	/** The persistable form of a raw header value, or {@code null} when nothing usable was offered. */
	static String sanitize(String header) {
		if (header == null) {
			return null;
		}
		String flattened = CONTROL_RUNS.matcher(header).replaceAll(" ").strip();
		if (flattened.isEmpty()) {
			return null;
		}
		return flattened.length() <= MAX_LENGTH ? flattened : flattened.substring(0, MAX_LENGTH).strip();
	}
}
