package ai.riviera.platform.web.adapter.in;

import java.util.List;

import org.springframework.web.util.HtmlUtils;

/**
 * The tags the server writes into a served SPA shell's {@code <head>} for link previews and crawlers: title,
 * description, canonical, {@code hreflang} alternates, Open Graph and Twitter card, or {@code noindex}. Every
 * value is HTML-escaped here and nowhere else. Nullable: {@code title}, {@code description}, {@code canonical},
 * {@code image}. Rationale: RESPONSIBILITIES.md §web.
 */
record ShellHead(String title, String description, String canonical, String image, List<Alternate> alternates,
		boolean noindex) {

	private static final String SITE_NAME = "Riviera";
	private static final String TITLE_OPEN = "<title>";
	private static final String TITLE_CLOSE = "</title>";
	private static final String HEAD_CLOSE = "</head>";
	/** The attribute an Open Graph {@code <meta>} names itself by; every other one uses {@link #NAME_KEY}. */
	private static final String PROPERTY_KEY = "property";
	private static final String NAME_KEY = "name";

	/** One language version of the page: its {@code hreflang} code ({@code x-default} included) and URL. */
	record Alternate(String hreflang, String url) {
	}

	/** An indexable page; {@code canonical}, {@code image} null and {@code alternates} empty without an origin. */
	static ShellHead page(String title, String description, String canonical, String image,
			List<Alternate> alternates) {
		return new ShellHead(title, description, canonical, image, List.copyOf(alternates), false);
	}

	/** A page that previews generically but must not be indexed (a hidden or unknown venue): no URL of its own. */
	static ShellHead unlisted(String title, String description) {
		return new ShellHead(title, description, null, null, List.of(), true);
	}

	/** A private page (booking, account, console): {@code noindex} alone, so nothing from its URL is echoed (#7). */
	static ShellHead privatePage() {
		return new ShellHead(null, null, null, null, List.of(), true);
	}

	/** The tags, one per line, in head order. */
	String render() {
		StringBuilder tags = new StringBuilder();
		if (title != null) {
			tags.append(TITLE_OPEN).append(escape(title)).append(TITLE_CLOSE).append('\n');
		}
		if (noindex) {
			tags.append("<meta name=\"robots\" content=\"noindex\">\n");
		}
		if (description != null) {
			meta(tags, NAME_KEY, "description", description);
		}
		if (canonical != null) {
			link(tags, "rel=\"canonical\"", canonical);
		}
		alternates.forEach(alternate ->
				link(tags, "rel=\"alternate\" hreflang=\"" + escape(alternate.hreflang()) + "\"", alternate.url()));
		if (title != null) {
			meta(tags, PROPERTY_KEY, "og:title", title);
			if (description != null) {
				meta(tags, PROPERTY_KEY, "og:description", description);
			}
			meta(tags, PROPERTY_KEY, "og:type", "website");
			meta(tags, PROPERTY_KEY, "og:site_name", SITE_NAME);
			if (canonical != null) {
				meta(tags, PROPERTY_KEY, "og:url", canonical);
			}
			if (image != null) {
				meta(tags, PROPERTY_KEY, "og:image", image);
			}
			meta(tags, NAME_KEY, "twitter:card", image != null ? "summary_large_image" : "summary");
		}
		return tags.toString();
	}

	/**
	 * {@code shell} with these tags in place of its {@code <title>} (kept when this head has none), else just
	 * before {@code </head>}; a shell with neither is returned unchanged. Literal splicing, never a regex
	 * replacement, so a {@code $} or {@code \} in a venue's name survives.
	 */
	String applyTo(String shell) {
		int titleStart = shell.indexOf(TITLE_OPEN);
		int titleEnd = titleStart < 0 ? -1 : shell.indexOf(TITLE_CLOSE, titleStart);
		if (titleEnd >= 0) {
			int afterTitle = titleEnd + TITLE_CLOSE.length();
			String kept = title == null ? shell.substring(titleStart, afterTitle) + '\n' : "";
			return shell.substring(0, titleStart) + kept + render().stripTrailing() + shell.substring(afterTitle);
		}
		int headEnd = shell.indexOf(HEAD_CLOSE);
		if (headEnd < 0) {
			return shell;
		}
		return shell.substring(0, headEnd) + render().stripTrailing() + shell.substring(headEnd);
	}

	private static void meta(StringBuilder tags, String key, String name, String content) {
		tags.append("<meta ").append(key).append("=\"").append(name).append("\" content=\"")
				.append(escape(content)).append("\">\n");
	}

	private static void link(StringBuilder tags, String relation, String href) {
		tags.append("<link ").append(relation).append(" href=\"").append(escape(href)).append("\">\n");
	}

	private static String escape(String value) {
		return HtmlUtils.htmlEscape(value, "UTF-8");
	}
}
