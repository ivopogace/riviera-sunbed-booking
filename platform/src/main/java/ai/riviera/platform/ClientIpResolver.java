package ai.riviera.platform;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Resolves the client IP used as the per-IP rate-limit key. The backend runs behind the Render proxy
 * (ADR-0004), so the originating client address arrives in {@code X-Forwarded-For} rather than as the
 * direct socket address; we take the first (left-most) hop — the original client — when present and
 * well-formed, and otherwise fall back to {@link HttpServletRequest#getRemoteAddr()}.
 *
 * <p>The header is partly user-controlled, so the returned value is stripped of CR/LF before it can
 * reach a logger — neutralising log-forging (the riviera-java-conventions log-injection guard). The
 * value is only ever used as a map key and, at most, a {@code debug} log field; the booking code is
 * never involved here (invariant #7).
 *
 * <p>Trusting {@code X-Forwarded-For} without a trusted-proxy allowlist means a forged header can
 * dodge the per-IP limit (ADR-0006, risk R-2); the per-code bucket and code entropy back it up, and a
 * proxy-trust config travels with the auth model.
 */
final class ClientIpResolver {

	private static final String FORWARDED_FOR = "X-Forwarded-For";
	private static final String UNKNOWN = "unknown";

	private ClientIpResolver() {
	}

	static String resolve(HttpServletRequest request) {
		String forwarded = request.getHeader(FORWARDED_FOR);
		if (forwarded != null && !forwarded.isBlank()) {
			String client = forwarded.split(",", 2)[0].trim();
			if (!client.isEmpty()) {
				return sanitise(client);
			}
		}
		return sanitise(request.getRemoteAddr());
	}

	private static String sanitise(String value) {
		if (value == null || value.isBlank()) {
			return UNKNOWN;
		}
		return value.replaceAll("[\\r\\n]", "_");
	}
}
