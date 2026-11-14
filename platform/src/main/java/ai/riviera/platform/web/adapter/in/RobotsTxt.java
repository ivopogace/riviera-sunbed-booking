package ai.riviera.platform.web.adapter.in;

import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * The {@code robots.txt} body (RFC 9309): every signed-in and booking surface of the SPA, in every served locale,
 * and the API are disallowed, and the sitemap is named when an origin is configured. A booking page's path carries
 * the bearer code (#7), so {@code /booking} is never crawlable. Rationale: {@code RESPONSIBILITIES.md} §{@code web}.
 */
final class RobotsTxt {

	/** SPA route prefixes behind sign-in or a booking code; each is disallowed under every locale's prefix. */
	static final List<String> PRIVATE_SPA_PATHS =
			List.of("/account", "/admin", "/booking", "/my-bookings", "/operator", "/venue-admin");

	/** Backend prefixes, served from the root only. */
	static final List<String> PRIVATE_BACKEND_PATHS = List.of("/api");

	private static final String EVERY_AGENT = "User-agent: *\n";

	private RobotsTxt() {
	}

	/** The body, naming {@code sitemapUrl} when given; {@code disallowAll} shuts every crawler out and names none. */
	static String render(@Nullable String sitemapUrl, boolean disallowAll) {
		if (disallowAll) {
			return EVERY_AGENT + "Disallow: /\n";
		}
		StringBuilder body = new StringBuilder(EVERY_AGENT);
		for (ServedLocale locale : ServedLocale.values()) {
			PRIVATE_SPA_PATHS.forEach(path -> body.append("Disallow: ").append(locale.pathOf(path)).append('\n'));
		}
		PRIVATE_BACKEND_PATHS.forEach(path -> body.append("Disallow: ").append(path).append('\n'));
		if (sitemapUrl != null) {
			body.append("\nSitemap: ").append(sitemapUrl).append('\n');
		}
		return body.toString();
	}
}
