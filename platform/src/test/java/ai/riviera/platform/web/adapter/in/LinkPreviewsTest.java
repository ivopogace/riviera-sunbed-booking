package ai.riviera.platform.web.adapter.in;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.Beach;
import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueLinkPreview;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** {@link LinkPreviews}: which head each route gets, from the venue read, the locale and the public origin. */
class LinkPreviewsTest {

	private static final String ORIGIN = "https://r.example";

	private final Map<Long, VenueLinkPreview> venues = new HashMap<>();
	private final VenueCatalog catalog = new VenueCatalog() {
		@Override
		public Optional<VenueLinkPreview> findLinkPreview(VenueId id) {
			return Optional.ofNullable(venues.get(id.value()));
		}

		@Override
		public Optional<VenueMapView> findVenueMap(VenueId id, StaySpan stay) {
			throw new UnsupportedOperationException();
		}

		@Override
		public List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date) {
			throw new UnsupportedOperationException();
		}

		@Override
		public Optional<List<DailyAvailability>> availabilityBetween(VenueId id, LocalDate from, LocalDate to) {
			throw new UnsupportedOperationException();
		}
	};

	private LinkPreviews previews(String origin) {
		return new LinkPreviews(catalog, new PublicWebProperties(origin, new PublicWebProperties.Robots(false)));
	}

	private static List<ShellHead.Alternate> alternates(String path, String xDefault) {
		return List.of(new ShellHead.Alternate("en", ORIGIN + path),
				new ShellHead.Alternate("sq", ORIGIN + "/sq" + path),
				new ShellHead.Alternate("it", ORIGIN + "/it" + path),
				new ShellHead.Alternate("x-default", ORIGIN + xDefault));
	}

	@Test
	void visibleVenueNamesItselfWithItsBeachLabelCoverAndCanonical() {
		venues.put(7L, new VenueLinkPreview("Miramar", Beach.SHKEMBI_I_KAVAJES, "Pines and sand.",
				"/api/venues/7/photos/ab"));

		ShellHead head = previews(ORIGIN).venue(SpaLocale.SQ, "7");

		assertEquals(ShellHead.page("Miramar, Shkëmbi i Kavajës — Riviera", "Pines and sand.",
				ORIGIN + "/sq/venues/7", ORIGIN + "/api/venues/7/photos/ab",
				alternates("/venues/7", "/venues/7")), head);
	}

	@Test
	void venueDescriptionIsItsFirstLineCollapsedAndCapped() {
		venues.put(1L, new VenueLinkPreview("A", Beach.KSAMIL, "  \n Calm   bay,\tclear water. \nSecond line.", null));
		venues.put(2L, new VenueLinkPreview("B", Beach.KSAMIL, "word ".repeat(60), null));
		venues.put(3L, new VenueLinkPreview("C", Beach.KSAMIL, "x".repeat(200), null));

		assertEquals("Calm bay, clear water.", previews(ORIGIN).venue(SpaLocale.EN, "1").description());
		String capped = previews(ORIGIN).venue(SpaLocale.EN, "2").description();
		assertTrue(capped.length() <= LinkPreviews.DESCRIPTION_LIMIT && capped.endsWith("word…"), capped);
		assertEquals("x".repeat(LinkPreviews.DESCRIPTION_LIMIT - 1) + "…",
				previews(ORIGIN).venue(SpaLocale.EN, "3").description());
	}

	@Test
	void venueWithoutDescriptionOrCoverFallsBackToTheGenericDescriptionAndNoImage() {
		venues.put(4L, new VenueLinkPreview("Bare", Beach.DHERMI, " \n ", null));

		ShellHead head = previews(ORIGIN).venue(SpaLocale.IT, "4");

		assertEquals(previews(ORIGIN).home(SpaLocale.IT).description(), head.description());
		assertNull(head.image());
	}

	@Test
	void unknownHiddenAndMalformedIdsGetTheGenericUnlistedHead() {
		ShellHead generic = ShellHead.unlisted(previews(ORIGIN).home(SpaLocale.EN).title(),
				previews(ORIGIN).home(SpaLocale.EN).description());

		for (String id : List.of("99", "abc", "0", "-1", "1.5", "99999999999999999999", "")) {
			assertEquals(generic, previews(ORIGIN).venue(SpaLocale.EN, id), id);
		}
	}

	@Test
	void homeIsGenericPerLocaleWithXDefaultAtTheRoot() {
		ShellHead en = previews(ORIGIN).home(SpaLocale.EN);
		ShellHead sq = previews(ORIGIN).home(SpaLocale.SQ);

		assertEquals("Riviera — Sunbed Booking", en.title());
		assertEquals("Riviera — Rezervim shezlongësh", sq.title());
		assertEquals("Riviera — Prenotazione lettini", previews(ORIGIN).home(SpaLocale.IT).title());
		assertEquals(ORIGIN + "/sq/", sq.canonical());
		assertEquals(alternates("/", "/"), sq.alternates());
		assertTrue(!en.noindex() && en.image() == null);
	}

	@Test
	void noOriginMeansNoAbsoluteUrls() {
		venues.put(5L, new VenueLinkPreview("Lido", Beach.JALE, "Rocks.", "/api/venues/5/photos/cd"));

		for (ShellHead head : List.of(previews("").venue(SpaLocale.EN, "5"), previews("").home(SpaLocale.SQ))) {
			assertNull(head.canonical());
			assertNull(head.image());
			assertEquals(List.of(), head.alternates());
		}
		assertEquals("Lido, Jalë — Riviera", previews("").venue(SpaLocale.EN, "5").title());
	}
}
