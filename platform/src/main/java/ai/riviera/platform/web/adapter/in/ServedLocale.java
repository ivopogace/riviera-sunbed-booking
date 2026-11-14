package ai.riviera.platform.web.adapter.in;

/**
 * A locale the SPA is served in (ADR-0030), as the crawl policy addresses it: the source locale from the root,
 * each other one under its own subpath. The root's {@code SpaLocale} is unreachable from a module, so this re-lists
 * it; {@code ServedLocaleTest} pins both to {@code frontend/angular.json}'s locales.
 */
enum ServedLocale {
	EN("en", ""),
	SQ("sq", "sq"),
	IT("it", "it");

	private final String code;
	private final String prefix;

	ServedLocale(String code, String subPath) {
		this.code = code;
		this.prefix = subPath.isEmpty() ? "" : "/" + subPath;
	}

	/** The locale's code, as {@code hreflang} carries it. */
	String code() {
		return code;
	}

	/** The path prefix the locale's pages sit under: empty for the source locale, else {@code /<subPath>}. */
	String prefix() {
		return prefix;
	}

	/** The locale's form of an SPA path that starts with {@code /}; the source locale's root stays {@code /}. */
	String pathOf(String spaPath) {
		return prefix + spaPath;
	}
}
