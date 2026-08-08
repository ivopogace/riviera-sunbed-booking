package ai.riviera.platform.venue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;
import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the venue read models carry the photo URLs (AC-8): the public discovery list and
 * beach-map read expose the COVER slot's card + banner serving URLs when a cover photo exists and
 * {@code null} otherwise, and the operator profile read exposes per-slot
 * {@code {present, previewUrl}}. URLs are the content-addressed serving path. The {@code bytea}
 * column must never be selected by these queries — that is pinned at review (R-3, the SQL selects
 * metadata columns only); this IT pins the wire shape. Testcontainers Postgres; skipped where
 * Docker is absent (CI runs it).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenuePhotoReadModelIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	PhotoStorage storage;

	@Autowired
	JdbcClient jdbc;

	private VenueId newVenue(String name) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'ReadModel Beach', 'ReadModel Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
		return new VenueId(id);
	}

	/** Make the bootstrap admin the explicit owner (owns-all retired) so a venue-scoped read passes. */
	private void grantToBootstrap(VenueId venue) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) "
						+ "SELECT :v, id FROM operator WHERE username = 'operator'")
				.param("v", venue.value()).update();
	}

	private static StoredVariant variant(PhotoSurface surface, String hashHex) {
		return new StoredVariant(surface, new ContentHash(hashHex), "image/jpeg", 640, 384, new byte[] {1});
	}

	private void seedCover(VenueId venue, String cardHash, String bannerHash, String previewHash) {
		storage.replace(venue, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, cardHash),
				variant(PhotoSurface.BANNER, bannerHash),
				variant(PhotoSurface.PREVIEW, previewHash))));
	}

	private static String url(VenueId venue, String hash) {
		return "/api/venues/" + venue.value() + "/photos/" + hash;
	}

	@Test
	void discoveryExposesCoverCardAndBannerUrlsAndNullWhenAbsent() throws Exception {
		VenueId withCover = newVenue("RM list venue with cover");
		VenueId noPhoto = newVenue("RM list venue without photo");
		seedCover(withCover, "1a01", "1b01", "1c01");

		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].coverPhoto.card", withCover.value())
						.value(contains(url(withCover, "1a01"))))
				.andExpect(jsonPath("$[?(@.id == %d)].coverPhoto.banner", withCover.value())
						.value(contains(url(withCover, "1b01"))))
				// The photo-less venue is present and its coverPhoto is null — the FE gradient fallback.
				.andExpect(jsonPath("$[?(@.id == %d && @.coverPhoto == null)]", noPhoto.value()).exists());
	}

	@Test
	void mapReadExposesCoverPhotoAndNullWhenAbsent() throws Exception {
		VenueId withCover = newVenue("RM map venue with cover");
		VenueId noPhoto = newVenue("RM map venue without photo");
		seedCover(withCover, "2a02", "2b02", "2c02");

		mvc.perform(get("/api/venues/{v}", withCover.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto.card").value(url(withCover, "2a02")))
				.andExpect(jsonPath("$.coverPhoto.banner").value(url(withCover, "2b02")));

		mvc.perform(get("/api/venues/{v}", noPhoto.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto").value(nullValue()));
	}

	@Test
	void operatorProfileExposesPerSlotPresenceAndPreviewUrl() throws Exception {
		// The bootstrap admin must own this venue (owns-all retired); denial is CrossVenueDenialIT's job.
		Cookie session = SessionLoginSupport.operatorSession(mvc, "operator", "test-operator-pw");
		VenueId venue = newVenue("RM profile venue");
		grantToBootstrap(venue);
		seedCover(venue, "3a03", "3b03", "3c03");

		// Emptiness IS the null previewUrl (review F-11) — all three slot keys are always present.
		mvc.perform(get("/api/venues/{v}/profile", venue.value()).cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.photos.cover.previewUrl").value(url(venue, "3c03")))
				.andExpect(jsonPath("$.photos.sunbeds.previewUrl").value(nullValue()))
				.andExpect(jsonPath("$.photos.bar.previewUrl").value(nullValue()));
	}
}
