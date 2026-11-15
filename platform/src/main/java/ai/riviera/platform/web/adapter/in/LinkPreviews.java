package ai.riviera.platform.web.adapter.in;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueLinkPreview;

/**
 * The {@link ShellHead} each previewed route gets: home's generic copy per locale, and a venue's name, beach
 * label, description and cover from {@link VenueCatalog} (tourist-visible only). Absolute URLs come from
 * {@link PublicWebProperties#absolute} alone. A hidden, unknown or malformed venue id previews generically,
 * unindexed, the same in every case so the page is no oracle. Rationale: RESPONSIBILITIES.md §web.
 */
final class LinkPreviews {

	/** The longest description a preview carries, ellipsis included; crawlers cut around here. */
	static final int DESCRIPTION_LIMIT = 160;

	private static final String HOME_PATH = "/";
	private static final String VENUES_SEGMENT = "venues";
	private static final char SLASH = '/';
	private static final String TITLE_SUFFIX = " — Riviera";
	private static final String ELLIPSIS = "…";
	private static final Pattern VENUE_ID = Pattern.compile("[1-9]\\d{0,17}");
	private static final Pattern WHITESPACE = Pattern.compile("\\s+");

	private final VenueCatalog catalog;
	private final PublicWebProperties properties;

	LinkPreviews(VenueCatalog catalog, PublicWebProperties properties) {
		this.catalog = catalog;
		this.properties = properties;
	}

	ShellHead home(SpaLocale locale) {
		Copy copy = Copy.of(locale);
		return ShellHead.page(copy.title(), copy.description(), url(locale, HOME_PATH), null, alternates(HOME_PATH));
	}

	ShellHead venue(SpaLocale locale, String rawId) {
		Copy copy = Copy.of(locale);
		Optional<VenueLinkPreview> found = VENUE_ID.matcher(rawId).matches()
				? catalog.findLinkPreview(new VenueId(Long.parseLong(rawId)))
				: Optional.empty();
		if (found.isEmpty()) {
			return ShellHead.unlisted(copy.title(), copy.description());
		}
		VenueLinkPreview venue = found.get();
		String path = SLASH + VENUES_SEGMENT + SLASH + rawId;
		String image = venue.coverUrl() == null ? null : properties.absolute(venue.coverUrl()).orElse(null);
		return ShellHead.page(venue.name() + ", " + venue.beach().label() + TITLE_SUFFIX,
				oneLine(venue.description()).orElse(copy.description()), url(locale, path), image, alternates(path));
	}

	private String url(SpaLocale locale, String path) {
		return properties.absolute(locale.path(path)).orElse(null);
	}

	/** Every locale's version of {@code path}, then {@code x-default} at the source locale's; none without an origin. */
	private List<ShellHead.Alternate> alternates(String path) {
		List<ShellHead.Alternate> alternates = new ArrayList<>();
		for (SpaLocale locale : SpaLocale.values()) {
			properties.absolute(locale.path(path))
					.ifPresent(url -> alternates.add(new ShellHead.Alternate(locale.code(), url)));
		}
		properties.absolute(path).ifPresent(url -> alternates.add(new ShellHead.Alternate("x-default", url)));
		return alternates;
	}

	/** The first non-blank line, whitespace collapsed, cut at a word before {@link #DESCRIPTION_LIMIT}. */
	private static Optional<String> oneLine(String description) {
		if (description == null) {
			return Optional.empty();
		}
		Optional<String> line = description.lines().map(String::strip).filter(l -> !l.isEmpty()).findFirst()
				.map(l -> WHITESPACE.matcher(l).replaceAll(" "));
		return line.map(text -> {
			if (text.codePointCount(0, text.length()) <= DESCRIPTION_LIMIT) {
				return text;
			}
			int end = text.offsetByCodePoints(0, DESCRIPTION_LIMIT - 1);
			int space = text.lastIndexOf(' ', end);
			return text.substring(0, space > 0 ? space : end).stripTrailing() + ELLIPSIS;
		});
	}

	/** Home's title and the generic description, per locale; translations reviewed with #1774. */
	private record Copy(String title, String description) {

		static Copy of(SpaLocale locale) {
			return switch (locale) {
				case EN -> new Copy("Riviera — Sunbed Booking",
						"Pre-book a sunbed set on the Albanian riviera: two loungers and an umbrella for the full "
								+ "day, paid in the app.");
				case SQ -> new Copy("Riviera — Rezervim shezlongësh",
						"Rezervoni paraprakisht një set shezlongësh në Rivierën Shqiptare: dy shezlongë dhe një "
								+ "çadër për gjithë ditën, me pagesë në aplikacion.");
				case IT -> new Copy("Riviera — Prenotazione lettini",
						"Prenota in anticipo un set di lettini sulla Riviera albanese: due lettini e un ombrellone "
								+ "per l’intera giornata, con pagamento nell’app.");
				case DE -> new Copy("Riviera — Liegen buchen",
						"Buchen Sie vorab ein Liegen-Set an der albanischen Riviera: zwei Liegen und ein Sonnenschirm "
								+ "für den ganzen Tag, bezahlt in der App.");
			};
		}
	}
}
