package ai.riviera.platform.web.adapter.in;

import java.util.Arrays;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

import ai.riviera.platform.shared.SiteLocale;

/**
 * A {@link SiteLocale} as {@code web} serves it (ADR-0030): its subpath and its own {@code index.html}.
 * The one locale-to-shell mapping on the server; {@code SpaLocaleTest} pins it to
 * {@code frontend/angular.json}'s locales and to {@link SiteLocale}, one row each.
 */
enum SpaLocale {
	EN(SiteLocale.EN),
	SQ(SiteLocale.SQ),
	IT(SiteLocale.IT),
	DE(SiteLocale.DE);

	private final String code;
	private final String subPath;
	private final Resource index;

	SpaLocale(SiteLocale site) {
		this.code = site.code();
		this.subPath = site.subPath();
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

	/** {@code appPath} (an app route with a leading {@code /}) as served in this locale, under its subpath. */
	String path(String appPath) {
		return subPath.isEmpty() ? appPath : "/" + subPath + appPath;
	}

	/** The translated locale served under {@code segment}, empty for any other segment (the source locale included). */
	static Optional<SpaLocale> ofSubPath(String segment) {
		return Arrays.stream(values()).filter(l -> !l.subPath.isEmpty() && l.subPath.equals(segment)).findFirst();
	}

	/** The locale a static resource path (relative, no leading slash) belongs to, by its first segment. */
	static SpaLocale ofResourcePath(String resourcePath) {
		int slash = resourcePath.indexOf('/');
		return ofSubPath(slash < 0 ? resourcePath : resourcePath.substring(0, slash)).orElse(EN);
	}
}
