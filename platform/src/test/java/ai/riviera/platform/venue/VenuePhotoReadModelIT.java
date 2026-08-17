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
import ai.riviera.platform.OwnershipFixtures;
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
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the venue read models carry the photo URLs (AC-8): the public discovery list and
 * beach-map read expose the COVER slot's card + banner serving URLs when a cover photo exists and
 * {@code null} otherwise, the discovery list's {@code photos} slideshow lists one card-sized URL
 * per occupied slot in slot order (CARD preferred, PREVIEW fallback for legacy secondary uploads),
 * and the operator profile read exposes per-slot {@code {present, previewUrl}}. URLs are the
 * content-addressed serving path. The {@code bytea} column must never be selected by these
 * queries — that is pinned at review (R-3, the SQL selects metadata columns only); this IT pins
 * the wire shape. Testcontainers Postgres; skipped where Docker is absent (CI runs it).
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

	/**
	 * Owned by the bootstrap ACTIVE operator: the tourist reads hide ownerless venues (#693), and
	 * the ownership row also lets the venue-scoped profile read pass (owns-all retired).
	 */
	private VenueId newVenue(String name) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'ReadModel Beach', 'ReadModel Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return new VenueId(id);
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
				.andExpect(jsonPath("$[?(@.id == %d && @.coverPhoto == null)]", noPhoto.value()).exists())
				// Slideshow: cover-only venue lists just the cover card; photo-less venue lists nothing.
				.andExpect(jsonPath("$[?(@.id == %d)].photos", withCover.value())
						.value(contains(contains(url(withCover, "1a01")))))
				.andExpect(jsonPath("$[?(@.id == %d)].photos", noPhoto.value())
						.value(contains(empty())));
	}

	@Test
	void discoveryExposesTheSlideshowInSlotOrderPreferringCardOverLegacyPreview() throws Exception {
		VenueId venue = newVenue("RM list venue with slideshow");
		seedCover(venue, "4a04", "4b04", "4c04");
		// A current secondary upload (CARD + PREVIEW) …
		storage.replace(venue, PhotoSlot.SUNBEDS, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "4d04"),
				variant(PhotoSurface.PREVIEW, "4e04"))));
		// … and a legacy one from before secondary slots grew a CARD variant (PREVIEW only).
		storage.replace(venue, PhotoSlot.BAR, new ProcessedPhoto(List.of(
				variant(PhotoSurface.PREVIEW, "4f04"))));

		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].photos", venue.value())
						.value(contains(contains(
								url(venue, "4a04"), url(venue, "4d04"), url(venue, "4f04")))));

		// The map read prefers BANNER per slot, falling back CARD → PREVIEW for older uploads.
		mvc.perform(get("/api/venues/{v}", venue.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.photos").value(contains(
						url(venue, "4b04"), url(venue, "4d04"), url(venue, "4f04"))));
	}

	@Test
	void mapReadExposesCoverPhotoAndNullWhenAbsent() throws Exception {
		VenueId withCover = newVenue("RM map venue with cover");
		VenueId noPhoto = newVenue("RM map venue without photo");
		seedCover(withCover, "2a02", "2b02", "2c02");

		mvc.perform(get("/api/venues/{v}", withCover.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto.card").value(url(withCover, "2a02")))
				.andExpect(jsonPath("$.coverPhoto.banner").value(url(withCover, "2b02")))
				// The banner slideshow serves the banner-sized variant of the one occupied slot.
				.andExpect(jsonPath("$.photos").value(contains(url(withCover, "2b02"))));

		mvc.perform(get("/api/venues/{v}", noPhoto.value()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.coverPhoto").value(nullValue()))
				.andExpect(jsonPath("$.photos").value(empty()));
	}

	@Test
	void operatorProfileExposesPerSlotPresenceAndPreviewUrl() throws Exception {
		// newVenue makes the bootstrap admin the owner; denial is CrossVenueDenialIT's job.
		Cookie session = SessionLoginSupport.operatorSession(mvc, "operator", "test-operator-pw");
		VenueId venue = newVenue("RM profile venue");
		seedCover(venue, "3a03", "3b03", "3c03");

		// Emptiness IS the null previewUrl (review F-11) — all three slot keys are always present.
		mvc.perform(get("/api/venues/{v}/profile", venue.value()).cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.photos.cover.previewUrl").value(url(venue, "3c03")))
				.andExpect(jsonPath("$.photos.sunbeds.previewUrl").value(nullValue()))
				.andExpect(jsonPath("$.photos.bar.previewUrl").value(nullValue()));
	}
}
