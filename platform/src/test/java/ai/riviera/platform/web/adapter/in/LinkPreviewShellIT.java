package ai.riviera.platform.web.adapter.in;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Link previews end to end (Testcontainers Postgres, the real {@code VenueCatalog} and visibility fence, the
 * stub shells under {@code src/test/resources/static/}): a visible venue's page carries its own escaped tags, a
 * hidden or unknown one the generic tags, and a booking page {@code noindex} without its code (#7).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "riviera.web.public-origin=https://riviera.example")
class LinkPreviewShellIT {

	private static final String ORIGIN = "https://riviera.example";
	private static final String NOINDEX = "<meta name=\"robots\" content=\"noindex\">";

	@Autowired
	MockMvc mvc;
	@Autowired
	PhotoStorage storage;
	@Autowired
	JdbcClient jdbc;

	private VenueId venue(String name, String description, boolean visible) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, description, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', :description, 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).param("description", description).query(Long.class).single();
		if (visible) {
			OwnershipFixtures.grantToBootstrap(jdbc, id);
		}
		return new VenueId(id);
	}

	private void cover(VenueId venue, String bannerHash) {
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				new StoredVariant(PhotoSurface.CARD, 1, new ContentHash("ca" + bannerHash.substring(2)), "image/jpeg", 640, 384,
						new byte[] {1}),
				new StoredVariant(PhotoSurface.BANNER, 1, new ContentHash(bannerHash), "image/jpeg", 1280, 480,
						new byte[] {1}))));
	}

	@Test
	void visibleVenueGetsItsOwnTags() throws Exception {
		VenueId id = venue("LPS Miramar", "Calm bay, clear water.\nOpen May to October.", true);
		cover(id, "1760b0");

		mvc.perform(get("/venues/{id}", id.value()))
				.andExpect(status().isOk())
				.andExpect(content().string(allOf(
						containsString("<title>LPS Miramar, Ksamil — Riviera</title>"),
						containsString("<meta property=\"og:title\" content=\"LPS Miramar, Ksamil — Riviera\">"),
						containsString("<meta name=\"description\" content=\"Calm bay, clear water.\">"),
						containsString("<meta property=\"og:image\" content=\"" + ORIGIN + "/api/venues/" + id.value()
								+ "/photos/1760b0\">"),
						containsString("<link rel=\"canonical\" href=\"" + ORIGIN + "/venues/" + id.value() + "\">"),
						containsString("<meta property=\"og:url\" content=\"" + ORIGIN + "/venues/" + id.value() + "\">"),
						not(containsString(NOINDEX)))));
	}

	@Test
	void localeShellGetsItsOwnCanonical() throws Exception {
		VenueId id = venue("LPS Lido", "Rocks.", true);

		mvc.perform(get("/sq/venues/{id}", id.value()))
				.andExpect(content().string(allOf(containsString("lang=\"sq\""),
						containsString("<link rel=\"canonical\" href=\"" + ORIGIN + "/sq/venues/" + id.value() + "\">"),
						containsString("<link rel=\"alternate\" hreflang=\"it\" href=\"" + ORIGIN + "/it/venues/"
								+ id.value() + "\">"),
						containsString("<link rel=\"alternate\" hreflang=\"x-default\" href=\"" + ORIGIN + "/venues/"
								+ id.value() + "\">"))));
	}

	@Test
	void hiddenVenueGetsGenericTagsAndNoName() throws Exception {
		VenueId hidden = venue("LPS Hidden Secret", "Not yet approved.", false);

		for (String path : List.of("/venues/" + hidden.value(), "/venues/" + Long.MAX_VALUE)) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(content().string(allOf(containsString(NOINDEX),
							containsString("<title>Riviera — Sunbed Booking</title>"),
							not(containsString("LPS Hidden Secret")), not(containsString("Not yet approved")),
							not(containsString("canonical")))));
		}
	}

	@Test
	void bookingPageIsNoindexAndCarriesNoCode() throws Exception {
		mvc.perform(get("/booking/RVQ9X2KD"))
				.andExpect(status().isOk())
				.andExpect(content().string(allOf(containsString(NOINDEX), not(containsString("RVQ9X2KD")),
						not(containsString("og:")), not(containsString("canonical")))));
	}

	@Test
	void venueValuesAreEscaped() throws Exception {
		VenueId id = venue("<script>alert(\"x\")</script> & 'Co' $1", "\"Quoted\" <b>bold</b>", true);

		mvc.perform(get("/venues/{id}", id.value()))
				.andExpect(content().string(allOf(
						containsString("<title>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Co&#39; $1, "
								+ "Ksamil — Riviera</title>"),
						containsString("content=\"&quot;Quoted&quot; &lt;b&gt;bold&lt;/b&gt;\""),
						not(containsString("<script>alert")), not(containsString("<b>bold")))));
	}
}
