package ai.riviera.platform.web.adapter.in;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

/**
 * A locale the SPA is built in and served under (ADR-0030): the source locale from the root, each
 * other one under its own subpath, each with its own {@code index.html}. The one locale-to-shell
 * mapping on the server; {@code SpaLocaleTest} pins it to {@code frontend/angular.json}'s locales.
 */
enum SpaLocale {
	EN("en", ""),
	SQ("sq", "sq"),
	IT("it", "it");

	private final String code;
	private final String subPath;
	private final Resource index;

	SpaLocale(String code, String subPath) {
		this.code = code;
		this.subPath = subPath;
		this.index = new ClassPathResource("static/" + (subPath.isEmpty() ? "" : subPath + "/") + "index.html");
	}

	/** The locale's code, as the build names it and its shell's {@code lang} carries it. */
	String code() {
		return code;
	}

	/** The URL segment the locale is served under; empty for the source locale at the root. */
	String subPath() {
		return subPath;
	}

	/** The locale's SPA shell, which its client routes fall back to. */
	Resource index() {
		return index;
	}

	/** The locale a static resource path (relative, no leading slash) belongs to, by its first segment. */
	static SpaLocale ofResourcePath(String resourcePath) {
		int slash = resourcePath.indexOf('/');
		String first = slash < 0 ? resourcePath : resourcePath.substring(0, slash);
		for (SpaLocale locale : values()) {
			if (!locale.subPath.isEmpty() && locale.subPath.equals(first)) {
				return locale;
			}
		}
		return EN;
	}
}
